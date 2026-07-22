import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import MapView, {
  Circle,
  Marker,
  PROVIDER_GOOGLE,
  type MapType,
  type Region,
} from '@/components/MapView';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { SeverityChip, type Severity } from '@/components/SeverityChip';
import { StatusBadge, type ReportStatus } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAllReports, getReportDetail, getEvacuationCenters, getActiveHazards, getWeatherWithFallback, updateProfile } from '@/services/api';
import type { WeatherData } from '@/services/api';
import type { Report as ApiReport, Hazard } from '@/types';
import { HeatmapZoneSummary } from '@/components/HeatmapZoneSummary';
type HazardType = 'all' | 'flood';

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

interface EvacCenter {
  id: string;
  name: string;
  address: string;
  type: string;
  capacity: number;
  latitude: number;
  longitude: number;
}

const HAZARD_META: Record<string, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = {
  flood: { label: 'Flood', icon: 'water', color: colors.brand[500] },
};

const HAZARD_MARKER_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  flash_flood:   { icon: 'thunderstorm', color: colors.floodHazard.flashFlood },
  river_flood:   { icon: 'water',        color: colors.floodHazard.riverFlood },
  coastal_flood: { icon: 'boat',         color: colors.floodHazard.coastalFlood },
  urban_flood:   { icon: 'business',     color: colors.floodHazard.urbanFlood },
  closed_road:   { icon: 'close-circle', color: colors.roadHazard.closedRoad },
  debris:        { icon: 'warning',      color: colors.roadHazard.debris },
  landslide:     { icon: 'earth',        color: colors.roadHazard.landslide },
  flooded_road:  { icon: 'car',          color: colors.roadHazard.impassable },
  slow_zone:     { icon: 'speedometer',  color: colors.roadHazard.slowDown },
};

type MapTypeKey = MapType | 'flood';

const MAP_TYPES: { key: MapTypeKey; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { key: 'standard',  label: 'Default',   icon: 'map-outline',    desc: 'Road map'           },
  { key: 'satellite', label: 'Satellite', icon: 'planet-outline', desc: 'Aerial imagery'     },
  { key: 'hybrid',    label: 'Hybrid',    icon: 'globe-outline',  desc: 'Satellite + labels' },
  { key: 'terrain',   label: 'Terrain',   icon: 'layers-outline', desc: 'Topographic'        },
  { key: 'flood',     label: 'Flood',     icon: 'water',          desc: 'Severity heatmap'   },
];

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1, moderate: 3, high: 6, critical: 10,
};

// Weather-style heatmap: multiple concentric rings per severity for gradient effect
const FLOOD_HEATMAP: Record<Severity, Array<{ fill: string; stroke: string; radius: number }>> = {
  low: [
    { fill: 'rgba(144,202,249,0.06)', stroke: 'transparent', radius: 350 },
    { fill: 'rgba(144,202,249,0.10)', stroke: 'transparent', radius: 200 },
    { fill: 'rgba(144,202,249,0.18)', stroke: 'rgba(144,202,249,0.3)', radius: 100 },
    { fill: 'rgba(144,202,249,0.30)', stroke: 'rgba(144,202,249,0.5)', radius: 40 },
  ],
  moderate: [
    { fill: 'rgba(66,165,245,0.06)', stroke: 'transparent', radius: 450 },
    { fill: 'rgba(66,165,245,0.12)', stroke: 'transparent', radius: 280 },
    { fill: 'rgba(66,165,245,0.22)', stroke: 'rgba(66,165,245,0.3)', radius: 140 },
    { fill: 'rgba(66,165,245,0.38)', stroke: 'rgba(66,165,245,0.5)', radius: 50 },
  ],
  high: [
    { fill: 'rgba(21,101,192,0.06)', stroke: 'transparent', radius: 550 },
    { fill: 'rgba(21,101,192,0.12)', stroke: 'transparent', radius: 350 },
    { fill: 'rgba(21,101,192,0.24)', stroke: 'rgba(21,101,192,0.3)', radius: 180 },
    { fill: 'rgba(21,101,192,0.42)', stroke: 'rgba(21,101,192,0.5)', radius: 70 },
  ],
  critical: [
    { fill: 'rgba(13,71,161,0.08)', stroke: 'transparent', radius: 700 },
    { fill: 'rgba(13,71,161,0.14)', stroke: 'transparent', radius: 450 },
    { fill: 'rgba(13,71,161,0.28)', stroke: 'rgba(13,71,161,0.3)', radius: 220 },
    { fill: 'rgba(13,71,161,0.50)', stroke: 'rgba(13,71,161,0.5)', radius: 90 },
  ],
};

const FLOOD_DEPTH: Record<Severity, string> = {
  low:      '~ 1 ft (ankle-deep)',
  moderate: '~ 1.5–2 ft (knee-deep)',
  high:     '~ 3 ft (waist-deep)',
  critical: '> 4 ft — dangerous',
};

const API_TYPE_TO_HAZARD: Record<string, Exclude<HazardType, 'all'>> = {
  'Flood': 'flood',
};

function fromApiReport(r: ApiReport): Report {
  return {
    id:         r.id,
    title:      r.title,
    hazardType: API_TYPE_TO_HAZARD[r.type] ?? 'flood',
    severity:   r.severity,
    status:     r.status,
    address:    r.address,
    reportedAt: r.reportedAt,
    latitude:   r.latitude,
    longitude:  r.longitude,
  };
}

const INITIAL_REGION: Region = {
  latitude: 14.0771, longitude: 120.6361,
  latitudeDelta: 0.06, longitudeDelta: 0.06,
};

const EVAC_TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  school:           { icon: 'school',          label: 'School'           },
  gymnasium:        { icon: 'fitness',         label: 'Gymnasium'        },
  barangay_hall:    { icon: 'business',        label: 'Barangay Hall'    },
  covered_court:    { icon: 'tennisball',      label: 'Covered Court'    },
  church:           { icon: 'location',        label: 'Church'           },
  community_center: { icon: 'people',          label: 'Community Center' },
};

const EVAC_COLOR = colors.evac;

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

const FALLBACK_EVAC_CENTERS: EvacCenter[] = [
  {
    id: 'evac-1',
    name: 'Nasugbu Municipal Gymnasium',
    address: 'J.P. Laurel St., Poblacion, Nasugbu, Batangas',
    type: 'gymnasium',
    capacity: 1200,
    latitude: 14.07780,
    longitude: 120.63820,
  },
  {
    id: 'evac-2',
    name: 'Nasugbu West Central School',
    address: 'Concepcion St., Brgy. IV, Nasugbu, Batangas',
    type: 'school',
    capacity: 2000,
    latitude: 14.07362,
    longitude: 120.63332,
  },
  {
    id: 'evac-3',
    name: 'Nasugbu East Central School',
    address: 'Poblacion, Nasugbu, Batangas',
    type: 'school',
    capacity: 900,
    latitude: 14.07620,
    longitude: 120.63680,
  },
  {
    id: 'evac-4',
    name: 'Nasugbu National High School',
    address: 'Brgy. Poblacion, Nasugbu, Batangas',
    type: 'school',
    capacity: 1500,
    latitude: 14.08100,
    longitude: 120.63900,
  },
  {
    id: 'evac-5',
    name: 'Pantalan Elementary School',
    address: 'Brgy. Pantalan, Nasugbu, Batangas',
    type: 'school',
    capacity: 450,
    latitude: 14.08560,
    longitude: 120.62950,
  },
  {
    id: 'evac-6',
    name: 'Pantalan Senior High School',
    address: 'Brgy. Pantalan, Nasugbu, Batangas',
    type: 'school',
    capacity: 600,
    latitude: 14.08720,
    longitude: 120.62870,
  },
  {
    id: 'evac-7',
    name: 'Banilad Elementary School',
    address: 'Brgy. Banilad, Nasugbu, Batangas',
    type: 'school',
    capacity: 380,
    latitude: 14.07920,
    longitude: 120.62780,
  },
  {
    id: 'evac-8',
    name: 'Munting Indang Elementary School',
    address: 'Brgy. Munting Indang, Nasugbu, Batangas',
    type: 'school',
    capacity: 350,
    latitude: 14.06650,
    longitude: 120.64220,
  },
  {
    id: 'evac-9',
    name: 'Kaylaway Elementary School',
    address: 'Brgy. Kaylaway, Nasugbu, Batangas',
    type: 'school',
    capacity: 420,
    latitude: 14.09750,
    longitude: 120.64780,
  },
  {
    id: 'evac-10',
    name: 'Kaylaway National High School',
    address: 'Brgy. Kaylaway, Nasugbu, Batangas',
    type: 'school',
    capacity: 700,
    latitude: 14.09650,
    longitude: 120.64950,
  },
  {
    id: 'evac-11',
    name: 'Riparo Elementary School',
    address: 'Brgy. Riparo, Nasugbu, Batangas',
    type: 'school',
    capacity: 320,
    latitude: 14.05650,
    longitude: 120.64480,
  },
  {
    id: 'evac-12',
    name: 'Bilaran High School',
    address: 'Catandaan, Brgy. Bilaran, Nasugbu, Batangas',
    type: 'school',
    capacity: 550,
    latitude: 14.05400,
    longitude: 120.63100,
  },
  {
    id: 'evac-13',
    name: 'BatStateU Nasugbu Campus',
    address: 'Brgy. Lanas, Nasugbu, Batangas',
    type: 'school',
    capacity: 1800,
    latitude: 14.07450,
    longitude: 120.63560,
  },
  {
    id: 'evac-14',
    name: 'Aga Elementary School',
    address: 'Brgy. Aga, Nasugbu, Batangas',
    type: 'school',
    capacity: 280,
    latitude: 14.06300,
    longitude: 120.62600,
  },
];

function HazardMarker({ report }: { report: Report }) {
  const meta     = report.hazardType !== 'all' ? HAZARD_META[report.hazardType] : null;
  const color    = meta?.color ?? colors.brand[500];
  const iconName = (meta?.icon ?? 'alert-circle') as keyof typeof Ionicons.glyphMap;
  const isCrit   = report.severity === 'critical';

  return (
    <View style={mk.wrapper}>
      {isCrit && <View style={[mk.pulse, { borderColor: color }]} />}
      <View style={[mk.circle, { backgroundColor: color }]}>
        <Ionicons name={iconName} size={13} color={colors.white} />
      </View>
    </View>
  );
}

const mk = StyleSheet.create({
  wrapper: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pulse: {
    position: 'absolute',
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, opacity: 0.35,
  },
  circle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28, shadowRadius: 4, elevation: 5,
  },
});

function EvacuationMarker() {
  return (
    <View style={em.wrapper}>
      <View style={em.circle}>
        <Ionicons name="shield-checkmark" size={13} color={colors.white} />
      </View>
    </View>
  );
}

const em = StyleSheet.create({
  wrapper: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: EVAC_COLOR,
    borderWidth: 2, borderColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: EVAC_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 5,
  },
});

function MapTypeModal({
  visible,
  current,
  onSelect,
  onClose,
  isDark,
}: {
  visible: boolean;
  current: MapTypeKey;
  onSelect: (t: MapTypeKey) => void;
  onClose: () => void;
  isDark: boolean;
}) {
  const bg    = isDark ? colors.slate[900] : colors.white;
  const bg2   = isDark ? colors.dark.surface : colors.slate[50];
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay.modalLight },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
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
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:    { width: '22%', flexGrow: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 8 },
  tileIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  tileDesc:  { fontSize: 10, textAlign: 'center' },
});

function ReportSheet({
  report,
  onClose,
  onViewDetail,
  isDark,
  bottomInset,
  photoUrls,
  photosLoading,
}: {
  report: Report;
  onClose: () => void;
  onViewDetail: (id: string) => void;
  isDark: boolean;
  bottomInset: number;
  photoUrls: string[];
  photosLoading: boolean;
}) {
  const bg         = isDark ? colors.slate[900] : colors.white;
  const textMain   = isDark ? colors.white      : colors.slate[900];
  const textSub    = isDark ? colors.slate[400] : colors.slate[500];
  const sepColor   = isDark ? colors.slate[800] : colors.slate[100];
  const pinColor   = colors.severity[report.severity];
  const hazardMeta = report.hazardType !== 'all' ? HAZARD_META[report.hazardType] : null;
  const thumbBg    = isDark ? colors.slate[800] : colors.slate[100];

  return (
    <View style={[bs.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 100 }]}>
      <View style={[bs.accentBar, { backgroundColor: pinColor }]} />
      <View style={bs.handle} />

      <View style={bs.header}>
        <View style={[bs.hazardIcon, { backgroundColor: (hazardMeta?.color ?? colors.brand[500]) + '1A' }]}>
          <Ionicons
            name={hazardMeta?.icon ?? 'alert-circle'}
            size={22}
            color={hazardMeta?.color ?? colors.brand[500]}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
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

      {(photosLoading || photoUrls.length > 0) && (
        <>
          <View style={[bs.divider, { backgroundColor: sepColor }]} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={bs.photoScroll}
          >
            {photosLoading
              ? [1, 2, 3].map(i => (
                  <View key={i} style={[bs.photoThumb, { backgroundColor: thumbBg }]}>
                    <ActivityIndicator size="small" color={colors.slate[400]} />
                  </View>
                ))
              : photoUrls.map((url, i) => (
                  <Pressable
                    key={i}
                    onPress={() => onViewDetail(report.id)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <Image
                      source={{ uri: url }}
                      style={bs.photoThumb}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))
            }
          </ScrollView>
        </>
      )}

      <View style={[bs.divider, { backgroundColor: sepColor }]} />

      {report.hazardType === 'flood' && (
        <View style={[bs.depthRow, { borderColor: sepColor }]}>
          <View style={bs.depthIconWrap}>
            <Ionicons name="water" size={14} color={colors.brand[500]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[bs.depthLabel, { color: textSub }]}>Estimated flood depth</Text>
            <Text style={[bs.depthValue, { color: colors.brand[500] }]}>{FLOOD_DEPTH[report.severity]}</Text>
          </View>
        </View>
      )}

      <View style={bs.statusRow}>
        <SeverityChip level={report.severity} />
        <StatusBadge status={report.status} />
        <View style={bs.timePill}>
          <Ionicons name="time-outline" size={11} color={colors.slate[400]} />
          <Text style={[bs.timeText, { color: textSub }]}>{report.reportedAt}</Text>
        </View>
      </View>

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
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar: { height: 4 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
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
  photoScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  photoThumb: {
    width: 90, height: 72, borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  depthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    marginBottom: 4,
    borderWidth: 1, borderRadius: 10,
    marginHorizontal: 16,
    backgroundColor: colors.brand[500] + '0D',
  },
  depthIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.brand[500] + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  depthLabel: { fontSize: 11, fontWeight: '500' },
  depthValue: { fontSize: 13, fontWeight: '700', marginTop: 1 },
});

function EvacSheet({
  center,
  onClose,
  onGetDirections,
  isDark,
  bottomInset,
  distanceKm,
}: {
  center: EvacCenter;
  onClose: () => void;
  onGetDirections: () => void;
  isDark: boolean;
  bottomInset: number;
  distanceKm: number | null;
}) {
  const bg       = isDark ? colors.slate[900] : colors.white;
  const textMain = isDark ? colors.white      : colors.slate[900];
  const textSub  = isDark ? colors.slate[400] : colors.slate[500];
  const sepColor = isDark ? colors.slate[800] : colors.slate[100];
  const meta     = EVAC_TYPE_META[center.type] ?? { icon: 'location' as const, label: center.type };

  return (
    <View style={[evs.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 100 }]}>
      <View style={evs.accentBar} />
      <View style={evs.handle} />

      <View style={evs.header}>
        <View style={evs.iconWrap}>
          <Ionicons name="shield-checkmark" size={24} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[evs.typeLabel, { color: EVAC_COLOR }]}>
            EVACUATION CENTER · {meta.label.toUpperCase()}
          </Text>
          <Text style={[evs.title, { color: textMain }]} numberOfLines={2}>
            {center.name}
          </Text>
          <View style={evs.addressRow}>
            <Ionicons name="location-sharp" size={12} color={EVAC_COLOR} />
            <Text style={[evs.address, { color: textSub }]} numberOfLines={1}>
              {center.address}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={[evs.closeBtn, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      {/* Mini map preview */}
      <View style={evs.miniMapWrap}>
        <MapView
          style={evs.miniMap}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: center.latitude,
            longitude: center.longitude,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          liteMode
        >
          <Marker
            coordinate={{ latitude: center.latitude, longitude: center.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: EVAC_COLOR, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-checkmark" size={14} color={colors.white} />
            </View>
          </Marker>
        </MapView>
      </View>

      <View style={[evs.divider, { backgroundColor: sepColor }]} />

      <View style={evs.statsRow}>
        <View style={[evs.statPill, { backgroundColor: EVAC_COLOR + '18' }]}>
          <Ionicons name="people" size={14} color={EVAC_COLOR} />
          <Text style={[evs.statText, { color: EVAC_COLOR }]}>
            Capacity {center.capacity.toLocaleString()}
          </Text>
        </View>
        {distanceKm !== null && (
          <View style={[evs.statPill, { backgroundColor: colors.brand[500] + '18' }]}>
            <Ionicons name="walk" size={14} color={colors.brand[500]} />
            <Text style={[evs.statText, { color: colors.brand[500] }]}>
              ~{fmtDist(distanceKm)} away
            </Text>
          </View>
        )}
        <View style={[evs.statPill, { backgroundColor: EVAC_COLOR + '18' }]}>
          <Ionicons name="checkmark-circle" size={14} color={EVAC_COLOR} />
          <Text style={[evs.statText, { color: EVAC_COLOR }]}>Open</Text>
        </View>
      </View>

      <View style={evs.actions}>
        <Pressable
          style={({ pressed }) => [evs.dirBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={onGetDirections}
          accessibilityLabel="Get directions"
        >
          <Ionicons name="navigate" size={16} color={colors.white} />
          <Text style={evs.dirBtnText}>Start — Get Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ───────────── Search Pin Detail Sheet ───────────── */

function SearchPinSheet({
  pin, onClose, onGetDirections, isDark, bottomInset, distanceKm,
}: {
  pin: { name: string; latitude: number; longitude: number };
  onClose: () => void;
  onGetDirections: () => void;
  isDark: boolean;
  bottomInset: number;
  distanceKm: number | null;
}) {
  const bg       = isDark ? colors.slate[900] : colors.white;
  const textMain = isDark ? colors.white      : colors.slate[900];
  const textSub  = isDark ? colors.slate[400] : colors.slate[500];

  return (
    <View style={[spSheet.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 100 }]}>
      <View style={spSheet.accentBar} />
      <View style={spSheet.handle} />

      <View style={spSheet.header}>
        <View style={spSheet.iconWrap}>
          <Ionicons name="location" size={24} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[spSheet.typeLabel, { color: colors.brand[500] }]}>
            PLACE
          </Text>
          <Text style={[spSheet.title, { color: textMain }]} numberOfLines={2}>
            {pin.name}
          </Text>
          <Text style={[spSheet.coords, { color: textSub }]}>
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={[spSheet.closeBtn, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      <View style={spSheet.statsRow}>
        {distanceKm !== null && (
          <View style={[spSheet.statPill, { backgroundColor: colors.brand[500] + '18' }]}>
            <Ionicons name="walk" size={14} color={colors.brand[500]} />
            <Text style={[spSheet.statText, { color: colors.brand[500] }]}>
              ~{fmtDist(distanceKm)} away
            </Text>
          </View>
        )}
      </View>

      <View style={spSheet.actions}>
        <Pressable
          style={({ pressed }) => [spSheet.dirBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={onGetDirections}
          accessibilityLabel="Get directions"
        >
          <Ionicons name="navigate" size={16} color={colors.white} />
          <Text style={spSheet.dirBtnText}>Get Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const spSheet = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar: { height: 4, backgroundColor: colors.brand[500] },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  header:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.brand[500],
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  typeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title:     { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  coords:    { fontSize: 12 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  statsRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  statText:  { fontSize: 13, fontWeight: '600' },
  actions:   { paddingHorizontal: 16, paddingTop: 12 },
  dirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.brand[500],
    paddingVertical: 14, borderRadius: 14,
  },
  dirBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});

const evs = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar: { height: 4, backgroundColor: EVAC_COLOR },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: EVAC_COLOR,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  typeLabel:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title:       { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  addressRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address:     { fontSize: 12, flex: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  miniMapWrap: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    height: 120,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  miniMap: {
    width: '100%',
    height: '100%',
  },
  divider:   { height: StyleSheet.hairlineWidth, marginBottom: 14 },
  statsRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  statText: { fontSize: 13, fontWeight: '600' },
  actions: { paddingHorizontal: 16, paddingTop: 12 },
  dirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: EVAC_COLOR,
    paddingVertical: 14, borderRadius: 14,
  },
  dirBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});

/* ───────────── Hazard Detail Sheet ───────────── */

const HAZARD_CATEGORY_LABELS: Record<string, string> = {
  flood: 'FLOOD HAZARD',
  road: 'ROAD HAZARD',
};

const HAZARD_TYPE_LABELS: Record<string, string> = {
  flash_flood:   'Flash Flood',
  river_flood:   'River Overflow',
  coastal_flood: 'Coastal / Storm Surge',
  urban_flood:   'Urban Flood',
  closed_road:   'Road Closed',
  debris:        'Debris / Obstruction',
  landslide:     'Landslide',
  flooded_road:  'Flooded Road',
  slow_zone:     'Slow Down Zone',
};

function HazardSheet({
  hazard,
  onClose,
  isDark,
  bottomInset,
}: {
  hazard: Hazard;
  onClose: () => void;
  isDark: boolean;
  bottomInset: number;
}) {
  const meta      = HAZARD_MARKER_META[hazard.type];
  const hzColor   = meta?.color ?? colors.severity[hazard.severity];
  const bg        = isDark ? colors.slate[900] : colors.white;
  const textMain  = isDark ? colors.white      : colors.slate[900];
  const textSub   = isDark ? colors.slate[400] : colors.slate[500];
  const sepColor  = isDark ? colors.slate[800] : colors.slate[100];
  const catLabel  = HAZARD_CATEGORY_LABELS[hazard.category] ?? 'HAZARD';
  const typeLabel = HAZARD_TYPE_LABELS[hazard.type] ?? hazard.type;

  return (
    <View style={[hzs.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 100 }]}>
      <View style={[hzs.accentBar, { backgroundColor: hzColor }]} />
      <View style={hzs.handle} />

      <View style={hzs.header}>
        <View style={[hzs.iconWrap, { backgroundColor: hzColor }]}>
          <Ionicons name={meta?.icon ?? 'alert'} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[hzs.catLabel, { color: hzColor }]}>
            {catLabel} · {typeLabel.toUpperCase()}
          </Text>
          <Text style={[hzs.title, { color: textMain }]} numberOfLines={2}>
            {hazard.title}
          </Text>
          {hazard.address ? (
            <View style={hzs.addressRow}>
              <Ionicons name="location-sharp" size={12} color={hzColor} />
              <Text style={[hzs.address, { color: textSub }]} numberOfLines={1}>
                {hazard.address}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          style={[hzs.closeBtn, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      <View style={[hzs.divider, { backgroundColor: sepColor }]} />

      <View style={hzs.chips}>
        <View style={[hzs.chip, { backgroundColor: colors.severity[hazard.severity] + '18' }]}>
          <View style={[hzs.chipDot, { backgroundColor: colors.severity[hazard.severity] }]} />
          <Text style={[hzs.chipText, { color: colors.severity[hazard.severity] }]}>
            {hazard.severity.charAt(0).toUpperCase() + hazard.severity.slice(1)}
          </Text>
        </View>
        <View style={[hzs.chip, { backgroundColor: hzColor + '18' }]}>
          <Ionicons name={meta?.icon ?? 'alert'} size={12} color={hzColor} />
          <Text style={[hzs.chipText, { color: hzColor }]}>{typeLabel}</Text>
        </View>
        <View style={[hzs.chip, { backgroundColor: colors.severity.low + '18' }]}>
          <View style={[hzs.chipDot, { backgroundColor: colors.severity.low }]} />
          <Text style={[hzs.chipText, { color: colors.severity.low }]}>Active</Text>
        </View>
      </View>

      {hazard.description ? (
        <View style={hzs.descWrap}>
          <Text style={[hzs.descText, { color: textSub }]}>{hazard.description}</Text>
        </View>
      ) : null}

      <View style={hzs.footer}>
        <Ionicons name="time-outline" size={12} color={textSub} />
        <Text style={[hzs.footerText, { color: textSub }]}>Reported {hazard.createdAt}</Text>
      </View>
    </View>
  );
}

const hzs = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar: { height: 4 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, marginBottom: 14,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  catLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { fontSize: 12, flex: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 14 },
  chips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  descWrap: { paddingHorizontal: 16, marginTop: 12 },
  descText: { fontSize: 13, lineHeight: 20 },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, marginTop: 12,
  },
  footerText: { fontSize: 11, fontWeight: '500' },
});

// ─── Weather helpers ──────────────────────────────────────────────────────────

function owmIconToIonicons(icon: string): keyof typeof Ionicons.glyphMap {
  if (icon.startsWith('01')) return 'sunny-outline';
  if (icon.startsWith('02') || icon.startsWith('03') || icon.startsWith('04')) return 'partly-sunny-outline';
  if (icon.startsWith('09') || icon.startsWith('10')) return 'rainy-outline';
  if (icon.startsWith('11')) return 'thunderstorm-outline';
  if (icon.startsWith('13')) return 'snow-outline';
  return 'cloud-outline';
}

function deriveFloodRisk(w: WeatherData, reports: Report[]): { level: Severity; label: string } {
  const rain = w.current.rainH ?? 0;
  const hasCritical = reports.some(r => r.severity === 'critical');
  const highCount   = reports.filter(r => r.severity === 'high').length;
  const hasAlerts   = w.alerts.length > 0;

  if (rain > 25 || hasCritical || hasAlerts)  return { level: 'critical', label: 'Critical' };
  if (rain > 10 || highCount >= 2)            return { level: 'high',     label: 'High'     };
  if (rain > 2  || highCount >= 1 || reports.length > 4) return { level: 'moderate', label: 'Moderate' };
  return { level: 'low', label: 'Low' };
}

function WeatherStrip({
  weather,
  reports,
  loading,
  isDark,
}: {
  weather: WeatherData | null;
  reports: Report[];
  loading: boolean;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const textSub  = isDark ? colors.slate[500] : colors.slate[400];
  const textMain = isDark ? colors.slate[200] : colors.slate[700];
  const divider  = isDark ? colors.slate[800] : colors.slate[100];
  const panelBg  = isDark ? colors.dark.card : '#F8FAFC';
  const tileBg   = isDark ? colors.dark.elevated : colors.white;
  const tileBorder = isDark ? colors.dark.border : colors.slate[100];

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    Animated.spring(expandAnim, { toValue: next ? 1 : 0, tension: 80, friction: 12, useNativeDriver: false }).start();
  }

  if (loading) {
    return (
      <View style={[ws.strip, { borderTopColor: divider }]}>
        <ActivityIndicator size="small" color={colors.brand[500]} />
        <Text style={[ws.desc, { color: textSub }]}>Loading weather…</Text>
      </View>
    );
  }

  if (!weather) return null;

  const { current, alerts, forecast } = weather;
  const iconName = owmIconToIonicons(current.icon);
  const today = forecast.length > 0 ? forecast[0] : null;

  const descLower = current.description.toLowerCase();
  const hasStorm = !!descLower.match(/thunder|storm|bagyo|typhoon|cyclone/);
  const hasAlerts = alerts.length > 0;
  const hasSevere = hasStorm || hasAlerts;

  return (
    <View>
      <Pressable onPress={toggle} style={[ws.strip, { borderTopColor: divider }]}>
        <Ionicons name={iconName} size={16} color={colors.brand[500]} />
        <Text style={[ws.temp, { color: textMain }]}>{Math.round(current.temperature)}°C</Text>
        <Text style={[ws.desc, { color: textSub }]} numberOfLines={1}>{current.description}</Text>

        {current.rainH > 0 && (
          <>
            <View style={[ws.sep, { backgroundColor: divider }]} />
            <Ionicons name="water" size={11} color={colors.brand[300]} />
            <Text style={[ws.rain, { color: colors.brand[500] }]}>{current.rainH} mm/h</Text>
          </>
        )}

        {hasSevere && (
          <>
            <View style={[ws.sep, { backgroundColor: divider }]} />
            <Ionicons name="warning" size={12} color={colors.severity.critical} />
          </>
        )}

        <View style={{ flex: 1 }} />
        <Animated.View style={{
          transform: [{ rotate: expandAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
        }}>
          <Ionicons name="chevron-down" size={16} color={textSub} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <Animated.View style={[ws.panel, { backgroundColor: panelBg, opacity: expandAnim }]}>
          {/* Section: Today's Details */}
          <Text style={[ws.sectionTitle, { color: textSub }]}>Today's Weather</Text>

          <View style={ws.tileGrid}>
            <View style={[ws.tile, { backgroundColor: isDark ? '#0E2A4A' : '#E8F4FD', borderColor: isDark ? '#1A3A5C' : '#C4DEF4' }]}>
              <View style={[ws.tileIcon, { backgroundColor: isDark ? '#1A3A5C' : '#C4DEF4' }]}>
                <Ionicons name="water-outline" size={15} color={isDark ? '#60A5FA' : colors.brand[500]} />
              </View>
              <Text style={[ws.tileValue, { color: textMain }]}>{current.humidity}%</Text>
              <Text style={[ws.tileLabel, { color: textSub }]}>Humidity</Text>
            </View>
            <View style={[ws.tile, { backgroundColor: isDark ? '#1A2E3A' : '#E6F7F1', borderColor: isDark ? '#264A3A' : '#B2E5D4' }]}>
              <View style={[ws.tileIcon, { backgroundColor: isDark ? '#264A3A' : '#B2E5D4' }]}>
                <Ionicons name="flag-outline" size={15} color={isDark ? '#34D399' : '#0FA896'} />
              </View>
              <Text style={[ws.tileValue, { color: textMain }]}>{current.windSpeed} m/s</Text>
              <Text style={[ws.tileLabel, { color: textSub }]}>Wind</Text>
            </View>
            {today && (
              <>
                <View style={[ws.tile, { backgroundColor: isDark ? '#1E1E3A' : '#EDE9FE', borderColor: isDark ? '#312E81' : '#C4B5FD' }]}>
                  <View style={[ws.tileIcon, { backgroundColor: isDark ? '#312E81' : '#C4B5FD' }]}>
                    <Ionicons name="trending-down" size={15} color={isDark ? '#A78BFA' : '#7C3AED'} />
                  </View>
                  <Text style={[ws.tileValue, { color: textMain }]}>{Math.round(today.tempMin)}°C</Text>
                  <Text style={[ws.tileLabel, { color: textSub }]}>Low</Text>
                </View>
                <View style={[ws.tile, { backgroundColor: isDark ? '#2A1A0A' : '#FEF3E2', borderColor: isDark ? '#4A2A0A' : '#FCCF7D' }]}>
                  <View style={[ws.tileIcon, { backgroundColor: isDark ? '#4A2A0A' : '#FCCF7D' }]}>
                    <Ionicons name="trending-up" size={15} color={isDark ? '#F59E0B' : '#D97706'} />
                  </View>
                  <Text style={[ws.tileValue, { color: textMain }]}>{Math.round(today.tempMax)}°C</Text>
                  <Text style={[ws.tileLabel, { color: textSub }]}>High</Text>
                </View>
              </>
            )}
            {today && today.rainTotal > 0 && (
              <View style={[ws.tile, { backgroundColor: isDark ? '#0A2540' : '#E0F2FE', borderColor: isDark ? '#0E3A5E' : '#7DD3FC' }]}>
                <View style={[ws.tileIcon, { backgroundColor: isDark ? '#0E3A5E' : '#7DD3FC' }]}>
                  <Ionicons name="rainy-outline" size={15} color={isDark ? '#38BDF8' : '#0284C7'} />
                </View>
                <Text style={[ws.tileValue, { color: textMain }]}>{today.rainTotal} mm</Text>
                <Text style={[ws.tileLabel, { color: textSub }]}>Rain Total</Text>
              </View>
            )}
            {today && today.pop > 0 && (
              <View style={[ws.tile, { backgroundColor: isDark ? '#1A1A2E' : '#FCE7F3', borderColor: isDark ? '#3A1A3A' : '#F9A8D4' }]}>
                <View style={[ws.tileIcon, { backgroundColor: isDark ? '#3A1A3A' : '#F9A8D4' }]}>
                  <Ionicons name="umbrella-outline" size={15} color={isDark ? '#F472B6' : '#DB2777'} />
                </View>
                <Text style={[ws.tileValue, { color: textMain }]}>{Math.round(today.pop > 1 ? today.pop : today.pop * 100)}%</Text>
                <Text style={[ws.tileLabel, { color: textSub }]}>Rain Chance</Text>
              </View>
            )}
          </View>

          {/* Section: Weather Advisory */}
          <Text style={[ws.sectionTitle, { color: textSub, marginTop: 6 }]}>Weather Advisory</Text>

          {hasSevere ? (
            <>
              {hasStorm && (
                <View style={[ws.advisoryCard, { backgroundColor: colors.severity.critical + '10', borderColor: colors.severity.critical + '30' }]}>
                  <View style={[ws.advisoryIconWrap, { backgroundColor: colors.severity.critical + '18' }]}>
                    <Ionicons name="thunderstorm" size={18} color={colors.severity.critical} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[ws.advisoryTitle, { color: colors.severity.critical }]}>Severe Weather Alert</Text>
                    <Text style={[ws.advisoryMsg, { color: textMain }]}>
                      Storm / typhoon activity detected in your area. Stay indoors and monitor updates.
                    </Text>
                  </View>
                </View>
              )}
              {alerts.map((a, i) => (
                <View key={i} style={[ws.advisoryCard, { backgroundColor: colors.severity.high + '10', borderColor: colors.severity.high + '30' }]}>
                  <View style={[ws.advisoryIconWrap, { backgroundColor: colors.severity.high + '18' }]}>
                    <Ionicons name="warning" size={18} color={colors.severity.high} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[ws.advisoryTitle, { color: colors.severity.high }]}>{a.title}</Text>
                    <Text style={[ws.advisoryMsg, { color: textMain }]} numberOfLines={4}>{a.message}</Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <View style={[ws.advisoryCard, { backgroundColor: colors.severity.low + '10', borderColor: colors.severity.low + '30' }]}>
              <View style={[ws.advisoryIconWrap, { backgroundColor: colors.severity.low + '18' }]}>
                <Ionicons name="shield-checkmark" size={18} color={colors.severity.low} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ws.advisoryTitle, { color: colors.severity.low }]}>No Severe Weather Advisory</Text>
                <Text style={[ws.advisoryMsg, { color: textSub }]}>
                  Conditions are normal. No typhoon, thunderstorm, or heavy rainfall warnings at this time.
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const ws = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  temp: { fontSize: 13, fontWeight: '700' },
  desc: { fontSize: 12, flexShrink: 1 },
  rain: { fontSize: 12, fontWeight: '600' },
  sep:  { width: StyleSheet.hairlineWidth, height: 12, marginHorizontal: 2 },
  panel: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tileValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  advisoryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  advisoryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advisoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  advisoryMsg: {
    fontSize: 12,
    lineHeight: 17,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const mapRef  = useRef<MapView>(null);
  const { token, user, setHomeAddress } = useAuth();

  const [reports,            setReports]            = useState<Report[]>([]);
  const [adminHazards,       setAdminHazards]       = useState<Hazard[]>([]);
  const [evacCenters,        setEvacCenters]        = useState<EvacCenter[]>(FALLBACK_EVAC_CENTERS);
  const filter: HazardType = 'all';
  const [mapTypeKey,         setMapTypeKey]          = useState<MapTypeKey>('standard');
  const [selected,           setSelected]           = useState<Report | null>(null);
  const [selectedHazard,     setSelectedHazard]     = useState<Hazard | null>(null);
  const [selectedEvac,       setSelectedEvac]       = useState<EvacCenter | null>(null);
  const [layersVisible,      setLayersVisible]      = useState(false);
  const [locating,           setLocating]           = useState(false);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [searchFocused,      setSearchFocused]      = useState(false);
  const [searchLoading,      setSearchLoading]      = useState(false);
  const [topCardHeight,      setTopCardHeight]      = useState(0);
  const [searchBarBottom,    setSearchBarBottom]    = useState(0);
  const [userLocation,       setUserLocation]       = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoUrls,          setPhotoUrls]          = useState<string[]>([]);
  const [photosLoading,      setPhotosLoading]      = useState(false);
  const [advisoryDismissed,  setAdvisoryDismissed]  = useState(false);
  const [zoneSummary, setZoneSummary] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchPin, setSearchPin] = useState<{ name: string; latitude: number; longitude: number } | null>(null);
  const [googlePlaces, setGooglePlaces] = useState<{ placeId: string; main: string; secondary: string; latitude?: number; longitude?: number }[]>([]);
  const [googlePlaceLoading, setGooglePlaceLoading] = useState<string | null>(null);
  const [weather,        setWeather]        = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [showHomeSetup,   setShowHomeSetup]   = useState(false);
  const [homeSetupLoading, setHomeSetupLoading] = useState(false);
  const [homeSetupDone,   setHomeSetupDone]   = useState(false);
  const heatmapOpacity = useRef(new Animated.Value(0)).current;

  // ── Search animations ─────────────────────────────────────────
  const searchFocusAnim   = useRef(new Animated.Value(0)).current;
  const dropdownAnim      = useRef(new Animated.Value(0)).current;
  const searchGlowAnim    = useRef(new Animated.Value(0)).current;
  const shimmerAnim       = useRef(new Animated.Value(0)).current;
  const searchInputRef    = useRef<TextInput>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultAnims       = useRef<Animated.Value[]>([]).current;

  // Prompt for home address if not configured
  useEffect(() => {
    if (user?.role === 'Resident' && !user?.homeAddress) {
      setShowHomeSetup(true);
    }
  }, []);

  async function handleHomeSetupUseLocation() {
    setHomeSetupLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShowHomeSetup(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const parts = [geo.street, geo.district, geo.city, geo.region]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      const address = parts.join(', ') || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      await setHomeAddress(address);
      if (token) {
        await updateProfile({ home_address: address }, token).catch(() => {});
      }
      setHomeSetupDone(true);
      setTimeout(() => {
        setShowHomeSetup(false);
        setHomeSetupDone(false);
      }, 1800);
    } catch {
      setShowHomeSetup(false);
    } finally {
      setHomeSetupLoading(false);
    }
  }

  // shimmer loop for loading skeleton
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  // glow pulse when focused
  useEffect(() => {
    if (searchFocused) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(searchGlowAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(searchGlowAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      searchGlowAnim.setValue(0);
    }
  }, [searchFocused, searchGlowAnim]);

  function handleSearchFocus() {
    setSearchFocused(true);
    Animated.parallel([
      Animated.spring(searchFocusAnim, { toValue: 1, tension: 80, friction: 12, useNativeDriver: false }),
      Animated.timing(dropdownAnim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }

  function handleSearchBlur() {
    Animated.parallel([
      Animated.spring(searchFocusAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: false }),
      Animated.timing(dropdownAnim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
    setTimeout(() => setSearchFocused(false), 220);
  }

  function handleSearchChange(text: string) {
    setSearchQuery(text);
    if (text.trim().length >= 2) {
      setSearchLoading(true);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(async () => {
        // Fetch Google Places Autocomplete
        try {
          const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID;
          if (key) {
            const loc = userLocation ?? { latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude };
            const url =
              `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
              `?input=${encodeURIComponent(text.trim() + ' Nasugbu')}` +
              `&location=${loc.latitude},${loc.longitude}` +
              `&radius=15000` +
              `&strictbounds=true` +
              `&key=${key}`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.status === 'OK' && json.predictions) {
              const predictions = json.predictions.slice(0, 5);
              // Fetch coordinates for each result before showing (enables proximity dedup)
              const withCoords = await Promise.all(
                predictions.map(async (p: any) => {
                  const entry = {
                    placeId: p.place_id,
                    main: p.structured_formatting?.main_text ?? p.description,
                    secondary: p.structured_formatting?.secondary_text ?? '',
                    latitude: undefined as number | undefined,
                    longitude: undefined as number | undefined,
                  };
                  try {
                    const detailUrl =
                      `https://maps.googleapis.com/maps/api/place/details/json` +
                      `?place_id=${p.place_id}&fields=geometry&key=${key}`;
                    const dRes = await fetch(detailUrl);
                    const dJson = await dRes.json();
                    const loc = dJson.result?.geometry?.location;
                    if (loc) { entry.latitude = loc.lat; entry.longitude = loc.lng; }
                  } catch {}
                  return entry;
                }),
              );
              setGooglePlaces(withCoords);
            } else {
              setGooglePlaces([]);
            }
          }
        } catch {
          setGooglePlaces([]);
        }
        setSearchLoading(false);
        animateResultItems();
      }, 400);
    } else {
      setSearchLoading(false);
      setGooglePlaces([]);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    }
  }

  async function handleGooglePlacePress(placeId: string, name: string) {
    setGooglePlaceLoading(placeId);
    try {
      const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID;
      if (!key) return;
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${placeId}` +
        `&fields=geometry` +
        `&key=${key}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === 'OK' && json.result?.geometry?.location) {
        const { lat, lng } = json.result.geometry.location;
        handlePlacePress({ name, latitude: lat, longitude: lng });
      }
    } catch {}
    setGooglePlaceLoading(null);
  }

  function animateResultItems() {
    // reset & stagger-animate each result row
    resultAnims.forEach(a => a.setValue(0));
    const anims = resultAnims.slice(0, 8).map((a, i) =>
      Animated.timing(a, {
        toValue: 1,
        duration: 260,
        delay: i * 50,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
  }

  // ensure enough anim values for results
  function getResultAnim(index: number): Animated.Value {
    if (!resultAnims[index]) {
      resultAnims[index] = new Animated.Value(0);
    }
    return resultAnims[index];
  }

  function handleClearSearch() {
    setSearchQuery('');
    setSearchLoading(false);
    setGooglePlaces([]);
    searchInputRef.current?.focus();
  }
  const showFloodHeatmap = mapTypeKey === 'flood';
  const mapType: MapType = mapTypeKey === 'flood' ? 'standard' : mapTypeKey;

  useEffect(() => {
    Animated.timing(heatmapOpacity, {
      toValue: showFloodHeatmap ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showFloodHeatmap, heatmapOpacity]);

  useEffect(() => {
    if (!token) return;
    getAllReports(token)
      .then(data => setReports(
        data
          .filter(r => r.status !== 'pending' && r.status !== 'rejected')
          .map(fromApiReport),
      ))
      .catch(() => {});
    getEvacuationCenters(token)
      .then(centers => {
        if (centers.length > 0) setEvacCenters(centers);
      })
      .catch(() => {});
    getActiveHazards(token)
      .then(setAdminHazards)
      .catch(() => {});
    // Fetch weather with area default immediately, then re-fetch with real location
    setWeatherLoading(true);
    getWeatherWithFallback(INITIAL_REGION.latitude, INITIAL_REGION.longitude, token)
      .then(w => { if (w) setWeather(w); })
      .catch(() => {})
      .finally(() => setWeatherLoading(false));

    // Real-time location tracking
    let locationSub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        locationSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
          (loc) => {
            setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          },
        );
      } catch {}
    })();

    return () => { locationSub?.remove(); };
  }, [token]);

  // Re-fetch weather with precise user location once known
  const refreshWeather = useCallback(() => {
    if (!token) return;
    const coords = userLocation ?? { latitude: INITIAL_REGION.latitude, longitude: INITIAL_REGION.longitude };
    getWeatherWithFallback(coords.latitude, coords.longitude, token)
      .then(w => { if (w) setWeather(w); })
      .catch(() => {});
  }, [token, userLocation]);

  useEffect(() => {
    refreshWeather();
  }, [refreshWeather]);

  // Auto-refresh weather every 15 min + when app returns to foreground
  useEffect(() => {
    const interval = setInterval(refreshWeather, 15 * 60 * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshWeather();
    });
    return () => { clearInterval(interval); sub.remove(); };
  }, [refreshWeather]);

  const filtered = filter === 'all'
    ? reports
    : reports.filter(r => r.hazardType === filter);

  const timeFiltered = filtered;

  function handleMarkerPress(report: Report) {
    setSelected(report);
    setPhotoUrls([]);
    setSelectedEvac(null);
    setSelectedHazard(null);
    mapRef.current?.animateToRegion({
      latitude: report.latitude - 0.01,
      longitude: report.longitude,
      latitudeDelta: 0.03, longitudeDelta: 0.03,
    }, 450);
    if (token) {
      setPhotosLoading(true);
      getReportDetail(report.id, token)
        .then(detail => setPhotoUrls(detail.mediaUrls ?? []))
        .catch(() => setPhotoUrls([]))
        .finally(() => setPhotosLoading(false));
    }
  }

  async function handleLocateMe() {
    if (locating) return;
    setLocating(true);
    try {
      // Use real-time tracked location if available, otherwise fetch fresh
      let coords = userLocation;
      if (!coords) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
      }
      mapRef.current?.animateToRegion({
        latitude:       coords.latitude,
        longitude:      coords.longitude,
        latitudeDelta:  0.008,
        longitudeDelta: 0.008,
      }, 600);
    } finally {
      setLocating(false);
    }
  }


  const trimmed = searchQuery.trim().toLowerCase();
  const isGenericEvacQuery = ['evacuation', 'center', 'shelter', 'evac'].some(kw => kw.includes(trimmed) || trimmed.includes(kw));
  const searchResults: EvacCenter[] = trimmed.length >= 2
    ? evacCenters.filter(c =>
        c.name.toLowerCase().includes(trimmed) ||
        c.address.toLowerCase().includes(trimmed) ||
        (EVAC_TYPE_META[c.type]?.label ?? c.type).toLowerCase().includes(trimmed) ||
        isGenericEvacQuery
      )
    : [];

  // Nasugbu place suggestions with coordinates for map pinning
  const nasugbuPlaces: { name: string; latitude: number; longitude: number }[] = [
    { name: 'Poblacion',        latitude: 14.0735, longitude: 120.6340 },
    { name: 'Bucana',           latitude: 14.0620, longitude: 120.6260 },
    { name: 'Wawa',             latitude: 14.0850, longitude: 120.6420 },
    { name: 'Lian',             latitude: 14.0375, longitude: 120.6491 },
    { name: 'Calatagan',        latitude: 13.8325, longitude: 120.6322 },
    { name: 'Balayan',          latitude: 13.9370, longitude: 120.7314 },
    { name: 'Calaca',           latitude: 13.9306, longitude: 120.8131 },
    { name: 'Tuy',              latitude: 14.0175, longitude: 120.7269 },
    { name: 'Nasugbu',          latitude: 14.0771, longitude: 120.6361 },
    { name: 'Pantalan',         latitude: 14.0690, longitude: 120.6290 },
    { name: 'Putat',            latitude: 14.0880, longitude: 120.6500 },
    { name: 'Dayap',            latitude: 14.0960, longitude: 120.6530 },
    { name: 'Cogunan',          latitude: 14.0810, longitude: 120.6480 },
    { name: 'Lumbangan',        latitude: 14.0780, longitude: 120.6270 },
    { name: 'San Diego',        latitude: 14.0640, longitude: 120.6390 },
    { name: 'Bilaran',          latitude: 14.0550, longitude: 120.6350 },
    { name: 'Natipuan',         latitude: 14.0480, longitude: 120.6240 },
    { name: 'Kaylaway',         latitude: 14.1020, longitude: 120.6570 },
    { name: 'Papaya',           latitude: 14.0920, longitude: 120.6600 },
    { name: 'Tumalim',          latitude: 14.1080, longitude: 120.6350 },
    { name: 'Banilad',          latitude: 14.0670, longitude: 120.6450 },
    { name: 'Malapad na Bato',  latitude: 14.0430, longitude: 120.6280 },
    { name: 'Looc',             latitude: 14.0700, longitude: 120.6200 },
    { name: 'Aga',              latitude: 14.0820, longitude: 120.6550 },
    { name: 'Bunducan',         latitude: 14.0600, longitude: 120.6180 },
    { name: 'Catandaan',        latitude: 14.0530, longitude: 120.6310 },
    { name: 'Calayo',           latitude: 14.0410, longitude: 120.6200 },
  ];
  const placeSuggestions = trimmed.length >= 2
    ? nasugbuPlaces.filter(p => p.name.toLowerCase().includes(trimmed)).slice(0, 4)
    : [];

  // Deduplicate: remove Google Places that match an evac center or place suggestion
  const filteredGooglePlaces = googlePlaces.filter(gp => {
    const gpLower = gp.main.toLowerCase();
    const gpSecondary = (gp.secondary ?? '').toLowerCase();
    for (const c of searchResults) {
      const cLower = c.name.toLowerCase();
      // Full name containment
      if (gpLower.includes(cLower) || cLower.includes(gpLower)) return false;
      // Search query appears in both names — likely same place
      if (trimmed.length >= 3 && gpLower.includes(trimmed) && cLower.includes(trimmed)) return false;
      // Proximity check — within 300m
      if (gp.latitude != null && gp.longitude != null) {
        if (haversineKm(gp.latitude, gp.longitude, c.latitude, c.longitude) < 0.3) return false;
      }
    }
    for (const p of placeSuggestions) {
      const pLower = p.name.toLowerCase();
      if (gpLower.includes(pLower) || pLower.includes(gpLower)) return false;
      if (trimmed.length >= 3 && gpLower.includes(trimmed) && pLower.includes(trimmed)) return false;
      if (gp.latitude != null && gp.longitude != null) {
        if (haversineKm(gp.latitude, gp.longitude, p.latitude, p.longitude) < 0.3) return false;
      }
    }
    return true;
  });

  function handlePlacePress(place: { name: string; latitude: number; longitude: number }) {
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchPin(place);
    setSelected(null);
    setSelectedEvac(null);
    setSelectedHazard(null);
    handleSearchBlur();
    mapRef.current?.animateToRegion({
      latitude:       place.latitude - 0.005,
      longitude:      place.longitude,
      latitudeDelta:  0.015,
      longitudeDelta: 0.015,
    }, 500);
  }

  function handleEvacResultPress(center: EvacCenter) {
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchPin(null);
    setSelectedEvac(center);
    setSelected(null);
    setSelectedHazard(null);
    mapRef.current?.animateToRegion({
      latitude:       center.latitude - 0.008,
      longitude:      center.longitude,
      latitudeDelta:  0.025,
      longitudeDelta: 0.025,
    }, 500);
  }

  function openDirections(center: EvacCenter) {
    const { latitude: lat, longitude: lng } = center;
    const label = encodeURIComponent(center.name);
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${lat},${lng}&dirflg=d`
      : `google.navigation:q=${lat},${lng}&mode=d`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`);
      }
    });
  }

  const cardBg   = isDark ? colors.overlay.darkDropdownBg   : '#FFFFFF';
  const ctrlBg   = isDark ? colors.overlay.darkDropdownCtrl : '#FFFFFF';
  const textMain = isDark ? colors.white              : colors.slate[900];
  const textSub  = isDark ? colors.slate[400]         : colors.slate[500];
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
          setSelectedEvac(null);
          setSelectedHazard(null);
          setSearchPin(null);
          setPhotoUrls([]);
          if (showFloodHeatmap && e?.nativeEvent?.coordinate) {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            const nearbyCount = reports.filter(r =>
              Math.abs(r.latitude - latitude) < 0.005 && Math.abs(r.longitude - longitude) < 0.005
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
        {showFloodHeatmap && timeFiltered.map(r => {
          const rings = FLOOD_HEATMAP[r.severity];
          return rings.map((ring, ri) => (
            <Circle
              key={`flood-${r.id}-${ri}`}
              center={{ latitude: r.latitude, longitude: r.longitude }}
              radius={ring.radius}
              fillColor={ring.fill}
              strokeColor={ring.stroke}
              strokeWidth={ri === rings.length - 1 ? 1.5 : 0}
              zIndex={SEVERITY_WEIGHT[r.severity] * 10 + ri}
            />
          ));
        })}

        {timeFiltered.map(report => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            onPress={() => handleMarkerPress(report)}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <HazardMarker report={report} />
          </Marker>
        ))}

        {/* Admin-created hazard markers */}
        {adminHazards.map(hz => {
          const meta = HAZARD_MARKER_META[hz.type];
          const hzColor = meta?.color ?? colors.severity[hz.severity];
          return (
            <Marker
              key={`hz-${hz.id}`}
              coordinate={{ latitude: hz.latitude, longitude: hz.longitude }}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={5}
              onPress={() => {
                setSelectedHazard(hz);
                setSelected(null);
                setSelectedEvac(null);
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={[s.hazardPin, { backgroundColor: hzColor }]}>
                  <Ionicons name={meta?.icon ?? 'alert'} size={14} color="#fff" />
                </View>
                <View style={[s.hazardPinTail, { borderTopColor: hzColor }]} />
              </View>
            </Marker>
          );
        })}

        {selectedEvac && (
          <Marker
            key={selectedEvac.id}
            coordinate={{ latitude: selectedEvac.latitude, longitude: selectedEvac.longitude }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={10}
          >
            <EvacuationMarker />
          </Marker>
        )}

        {searchPin && (
          <Marker
            key={`search-pin-${searchPin.name}`}
            coordinate={{ latitude: searchPin.latitude, longitude: searchPin.longitude }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={12}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={{
                backgroundColor: colors.brand[500],
                borderRadius: 20,
                width: 36,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 6,
              }}>
                <Ionicons name="location" size={20} color="#fff" />
              </View>
              <View style={{
                width: 0, height: 0,
                borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
                borderLeftColor: 'transparent', borderRightColor: 'transparent',
                borderTopColor: colors.brand[500],
                marginTop: -1,
              }} />
              <View style={{
                backgroundColor: isDark ? '#1E293B' : '#fff',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                marginTop: 2,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.15,
                shadowRadius: 2,
                elevation: 3,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#fff' : colors.slate[800] }}>
                  {searchPin.name}
                </Text>
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      <View
        style={[s.topCard, { paddingTop: insets.top + 8, backgroundColor: cardBg }]}
        onLayout={e => setTopCardHeight(e.nativeEvent.layout.height)}
      >
        <View style={s.searchRow} onLayout={e => {
          const { y, height } = e.nativeEvent.layout;
          setSearchBarBottom(insets.top + 8 + y + height);
        }}>
          <Animated.View style={[
            s.searchBar,
            isDark && { backgroundColor: colors.slate[800], borderColor: colors.slate[700] },
            searchQuery.length > 0 && { borderColor: EVAC_COLOR },
            {
              borderColor: searchFocusAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [isDark ? colors.slate[700] : colors.slate[200], colors.brand[500]],
              }),
              shadowOpacity: searchFocusAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.18],
              }),
              shadowRadius: searchFocusAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 16],
              }),
              shadowColor: colors.brand[500],
              shadowOffset: { width: 0, height: 0 },
              elevation: searchFocused ? 6 : 0,
            },
          ]}>
            {/* Glow ring */}
            {searchFocused && (
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: colors.brand[500],
                    opacity: searchGlowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.15, 0.4],
                    }),
                  },
                ]}
              />
            )}
            <Animated.View style={{
              transform: [{
                scale: searchFocusAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.15],
                }),
              }],
            }}>
              <Ionicons
                name={searchFocused ? 'search' : 'search-outline'}
                size={17}
                color={searchQuery.length > 0 ? EVAC_COLOR : searchFocused ? colors.brand[500] : colors.slate[400]}
              />
            </Animated.View>
            <TextInput
              ref={searchInputRef}
              style={[s.searchInput, { color: isDark ? colors.white : colors.slate[900] }]}
              placeholder="Search places & evacuation centers..."
              placeholderTextColor={textSub}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              returnKeyType="search"
              clearButtonMode="never"
              autoCorrect={false}
            />
            {(searchFocused || searchQuery.length > 0) && (
              <Pressable onPress={() => {
                if (searchQuery.length > 0) {
                  handleClearSearch();
                } else {
                  Keyboard.dismiss();
                  handleSearchBlur();
                }
              }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={isDark ? colors.slate[400] : colors.slate[400]} />
              </Pressable>
            )}
          </Animated.View>

        </View>

        {!searchFocused && (
          <WeatherStrip
            weather={weather}
            reports={reports}
            loading={weatherLoading}
            isDark={isDark}
          />
        )}
      </View>

      {searchFocused && (
        <Animated.View style={[
          s.dropdown,
          {
            top: topCardHeight,
            backgroundColor: isDark ? colors.dark.surface : colors.white,
            opacity: dropdownAnim,
            transform: [{
              translateY: dropdownAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-10, 0],
              }),
            }],
          },
        ]}>
          {/* Top gradient accent line */}
          <LinearGradient
            colors={[colors.brand[500], EVAC_COLOR]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 2 }}
          />

          {trimmed.length < 2 ? (
            <>
              <View style={[s.dropdownSuggestHeader, { borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                <View style={s.dropdownSparkleWrap}>
                  <Ionicons name="sparkles" size={12} color={colors.brand[500]} />
                </View>
                <Text style={[s.dropdownSuggestTitle, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                  Quick search
                </Text>
              </View>
              {[
                { icon: 'shield-checkmark' as const, label: 'Evacuation centers near me', query: 'evacuation', gradient: [EVAC_COLOR, '#059669'] as [string, string] },
                { icon: 'school'           as const, label: 'Schools',                    query: 'school',     gradient: [colors.brand[500], colors.iconAccents.indigo] as [string, string] },
                { icon: 'fitness'          as const, label: 'Gymnasium',                  query: 'gymnasium',  gradient: [colors.iconAccents.amber, '#EA580C'] as [string, string] },
                { icon: 'people'           as const, label: 'High-capacity shelters',     query: 'high',       gradient: [colors.iconAccents.purple, colors.gradients.cta[1]] as [string, string] },
              ].map((s2, idx, arr) => (
                <Pressable
                  key={s2.query}
                  style={({ pressed }) => [
                    s.dropdownItem,
                    idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] },
                    pressed && { backgroundColor: isDark ? colors.dark.card : colors.brand[500] + '08', transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={() => handleSearchChange(s2.query)}
                >
                  <LinearGradient
                    colors={s2.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.dropdownIconGradient}
                  >
                    <Ionicons name={s2.icon} size={15} color={colors.white} />
                  </LinearGradient>
                  <Text style={[s.dropdownName, { color: isDark ? colors.slate[300] : colors.slate[700], fontWeight: '500', flex: 1 }]}>
                    {s2.label}
                  </Text>
                  <View style={s.dropdownArrowWrap}>
                    <Ionicons name="arrow-forward" size={12} color={colors.brand[500]} />
                  </View>
                </Pressable>
              ))}
            </>
          ) : searchLoading ? (
            /* ── Shimmer loading skeleton ── */
            <View style={s.shimmerContainer}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[s.shimmerRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                  <Animated.View style={[
                    s.shimmerIcon,
                    {
                      backgroundColor: isDark ? colors.slate[700] : colors.slate[200],
                      opacity: shimmerAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.4, 1, 0.4],
                      }),
                    },
                  ]} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Animated.View style={[
                      s.shimmerLine,
                      { width: `${70 - i * 12}%` as any, backgroundColor: isDark ? colors.slate[700] : colors.slate[200] },
                      {
                        opacity: shimmerAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.4, 1, 0.4],
                        }),
                      },
                    ]} />
                    <Animated.View style={[
                      s.shimmerLine,
                      { width: `${90 - i * 8}%` as any, height: 8, backgroundColor: isDark ? colors.slate[700] : colors.slate[200] },
                      {
                        opacity: shimmerAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.3, 0.8, 0.3],
                        }),
                      },
                    ]} />
                  </View>
                </View>
              ))}
              <View style={s.shimmerFooter}>
                <ActivityIndicator size="small" color={colors.brand[500]} />
                <Text style={[s.shimmerFooterText, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>
                  Searching...
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Place suggestions */}
              {placeSuggestions.length > 0 && (
                <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }}>
                  <View style={[s.dropdownSuggestHeader, { borderBottomColor: 'transparent' }]}>
                    <Ionicons name="location" size={12} color={colors.iconAccents.amber} />
                    <Text style={[s.dropdownSuggestTitle, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                      Places in Nasugbu
                    </Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, gap: 8 }}>
                    {placeSuggestions.map(place => (
                      <Pressable
                        key={place.name}
                        onPress={() => handlePlacePress(place)}
                        style={({ pressed }) => [{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: pressed
                            ? (isDark ? colors.dark.elevated : colors.brand[100])
                            : (isDark ? colors.dark.card : colors.slate[50]),
                          borderWidth: 1,
                          borderColor: isDark ? colors.dark.border : colors.slate[200],
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }]}
                      >
                        <Ionicons name="navigate-outline" size={11} color={colors.brand[500]} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? colors.slate[300] : colors.slate[600] }}>{place.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {searchResults.length === 0 && filteredGooglePlaces.length === 0 && placeSuggestions.length === 0 ? (
                /* ── Empty state ── */
                <View style={s.dropdownEmpty}>
                  <View style={s.emptyIconWrap}>
                    <Ionicons name="search-outline" size={28} color={isDark ? colors.slate[600] : colors.slate[300]} />
                  </View>
                  <Text style={[s.dropdownEmptyTitle, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                    No results found
                  </Text>
                  <Text style={[s.dropdownEmptyText, { color: isDark ? colors.slate[600] : colors.slate[400] }]}>
                    Try searching for a place or "evacuation"
                  </Text>
                </View>
              ) : (
                /* ── Results ── */
                <>
                  <View style={[s.resultCountHeader, { borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                    <View style={s.resultCountBadge}>
                      <Text style={s.resultCountText}>
                        {searchResults.length + placeSuggestions.length + filteredGooglePlaces.length}
                      </Text>
                    </View>
                    <Text style={[s.resultCountLabel, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                      {searchResults.length + placeSuggestions.length + filteredGooglePlaces.length === 1 ? 'result found' : 'results found'}
                    </Text>
                  </View>
              {searchResults.map((center, idx) => {
                const distKm = userLocation
                  ? haversineKm(userLocation.latitude, userLocation.longitude, center.latitude, center.longitude)
                  : null;
                const isLast = idx === searchResults.length - 1;
                return (
                  <View key={center.id}>
                    <Pressable
                      style={({ pressed }) => [
                        s.dropdownItem,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] },
                        pressed && { backgroundColor: isDark ? colors.dark.card : EVAC_COLOR + '08', transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={() => handleEvacResultPress(center)}
                      accessibilityLabel={center.name}
                    >
                      <LinearGradient
                        colors={[EVAC_COLOR, '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.dropdownIconGradient}
                      >
                        <Ionicons name="shield-checkmark" size={15} color={colors.white} />
                      </LinearGradient>
                      <View style={s.dropdownText}>
                        <Text style={[s.dropdownName, { color: isDark ? colors.white : colors.slate[900] }]} numberOfLines={1}>
                          {center.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="location-outline" size={10} color={isDark ? colors.slate[500] : colors.slate[400]} />
                          <Text style={[s.dropdownAddr, { color: isDark ? colors.slate[400] : colors.slate[500] }]} numberOfLines={1}>
                            {center.address}
                          </Text>
                        </View>
                      </View>
                      {distKm !== null && (
                        <View style={s.dropdownDistPill}>
                          <Ionicons name="walk-outline" size={11} color={EVAC_COLOR} />
                          <Text style={s.dropdownDistText}>{fmtDist(distKm)}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={isDark ? colors.slate[600] : colors.slate[300]} />
                    </Pressable>
                  </View>
                );
              })}
                </>
              )}

              {/* ── Google Places results ── */}
              {filteredGooglePlaces.length > 0 && (
                <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? colors.dark.border : colors.slate[100] }}>
                  <View style={[s.dropdownSuggestHeader, { borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                    <Ionicons name="globe-outline" size={12} color={colors.brand[500]} />
                    <Text style={[s.dropdownSuggestTitle, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                      Google Places
                    </Text>
                  </View>
                  {filteredGooglePlaces.map((place, idx) => (
                    <Pressable
                      key={place.placeId}
                      style={({ pressed }) => [
                        s.dropdownItem,
                        idx < filteredGooglePlaces.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] },
                        pressed && { backgroundColor: isDark ? colors.dark.card : colors.brand[500] + '08', transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={() => handleGooglePlacePress(place.placeId, place.main)}
                      accessibilityLabel={place.main}
                    >
                      <LinearGradient
                        colors={[colors.brand[500], colors.iconAccents.indigo]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.dropdownIconGradient}
                      >
                        {googlePlaceLoading === place.placeId
                          ? <ActivityIndicator size={13} color={colors.white} />
                          : <Ionicons name="location" size={15} color={colors.white} />
                        }
                      </LinearGradient>
                      <View style={s.dropdownText}>
                        <Text style={[s.dropdownName, { color: isDark ? colors.white : colors.slate[900] }]} numberOfLines={1}>
                          {place.main}
                        </Text>
                        {place.secondary ? (
                          <Text style={[s.dropdownAddr, { color: isDark ? colors.slate[400] : colors.slate[500] }]} numberOfLines={1}>
                            {place.secondary}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={isDark ? colors.slate[600] : colors.slate[300]} />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
        </Animated.View>
      )}

      {!selected && !selectedEvac && (
        <>
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 122, right: 12, backgroundColor: ctrlBg },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => router.push('/resident/family')}
            accessibilityLabel="Family safety check-in"
          >
            <Ionicons name="people" size={20} color={colors.brand[500]} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 68, right: 12, backgroundColor: ctrlBg },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setLayersVisible(true)}
            accessibilityLabel="Map layers"
          >
            <Ionicons
              name="layers-outline"
              size={22}
              color={mapTypeKey !== 'standard' ? colors.brand[500] : (isDark ? colors.slate[300] : colors.slate[700])}
            />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 14, right: 12, backgroundColor: ctrlBg },
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

      {selected && (
        <ReportSheet
          report={selected}
          onClose={() => { setSelected(null); setPhotoUrls([]); }}
          onViewDetail={id => router.push(`/resident/report/${id}`)}
          isDark={isDark}
          bottomInset={insets.bottom}
          photoUrls={photoUrls}
          photosLoading={photosLoading}
        />
      )}

      {selectedEvac && (
        <EvacSheet
          center={selectedEvac}
          onClose={() => setSelectedEvac(null)}
          onGetDirections={() => openDirections(selectedEvac)}
          isDark={isDark}
          bottomInset={insets.bottom}
          distanceKm={
            userLocation
              ? haversineKm(userLocation.latitude, userLocation.longitude, selectedEvac.latitude, selectedEvac.longitude)
              : null
          }
        />
      )}

      {searchPin && !selected && !selectedEvac && (
        <SearchPinSheet
          pin={searchPin}
          onClose={() => setSearchPin(null)}
          onGetDirections={() => {
            const { latitude: lat, longitude: lng, name } = searchPin;
            const label = encodeURIComponent(name);
            const url = Platform.OS === 'ios'
              ? `maps://?daddr=${lat},${lng}&dirflg=d`
              : `google.navigation:q=${lat},${lng}&mode=d`;
            Linking.canOpenURL(url).then(supported => {
              if (supported) {
                Linking.openURL(url);
              } else {
                Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`);
              }
            });
          }}
          isDark={isDark}
          bottomInset={insets.bottom}
          distanceKm={
            userLocation
              ? haversineKm(userLocation.latitude, userLocation.longitude, searchPin.latitude, searchPin.longitude)
              : null
          }
        />
      )}

      {zoneSummary && (
        <HeatmapZoneSummary
          latitude={zoneSummary.latitude}
          longitude={zoneSummary.longitude}
          reports={reports.map(r => ({
            id: r.id,
            severity: r.severity,
            hazardType: r.hazardType,
            latitude: r.latitude,
            longitude: r.longitude,
          }))}
          radiusKm={0.5}
          onClose={() => setZoneSummary(null)}
          isDark={isDark}
        />
      )}

      <MapTypeModal
        visible={layersVisible}
        current={mapTypeKey}
        onSelect={setMapTypeKey}
        onClose={() => setLayersVisible(false)}
        isDark={isDark}
      />

      <Modal visible={showHomeSetup} transparent animationType="fade" onRequestClose={() => !homeSetupLoading && setShowHomeSetup(false)}>
        <View style={homeSetupStyles.overlay}>
          <View style={[homeSetupStyles.sheet, isDark && { backgroundColor: colors.dark.elevated }]}>
            {homeSetupDone ? (
              <LinearGradient
                colors={['#22c55e', '#16a34a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={homeSetupStyles.successWrap}
              >
                <View style={homeSetupStyles.successIconWrap}>
                  <Ionicons name="checkmark-circle" size={56} color={colors.white} />
                </View>
                <Text style={homeSetupStyles.successTitle}>Home address saved!</Text>
                <Text style={homeSetupStyles.successSub}>You'll now receive alerts relevant to your home area.</Text>
              </LinearGradient>
            ) : (
              <>
                <LinearGradient
                  colors={colors.gradients.hero}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={homeSetupStyles.header}
                >
                  <View style={homeSetupStyles.iconWrap}>
                    <Ionicons name="home" size={28} color={colors.white} />
                  </View>
                  <Text style={homeSetupStyles.headerTitle}>Set Home Address</Text>
                  <Text style={homeSetupStyles.headerSub}>
                    We'll use your location to give you faster flood alerts near your home.
                  </Text>
                </LinearGradient>

                <View style={homeSetupStyles.body}>
                  <Pressable
                    style={({ pressed }) => [
                      homeSetupStyles.primaryBtn,
                      pressed && { opacity: 0.85 },
                      homeSetupLoading && { opacity: 0.7 },
                    ]}
                    onPress={handleHomeSetupUseLocation}
                    disabled={homeSetupLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Use my current location"
                  >
                    <LinearGradient
                      colors={colors.gradients.cta}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={homeSetupStyles.primaryBtnGrad}
                    >
                      {homeSetupLoading ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Ionicons name="locate" size={18} color={colors.white} />
                          <Text style={homeSetupStyles.primaryBtnText}>Use My Location</Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [homeSetupStyles.skipBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => setShowHomeSetup(false)}
                    disabled={homeSetupLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Skip"
                  >
                    <Text style={[homeSetupStyles.skipText, isDark && { color: colors.slate[400] }]}>Skip for now</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  topCard: {
    position: 'absolute', top: 0, left: 0, right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 10,
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
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  searchPlaceholder: { fontSize: 14, flex: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  countDot: { width: 6, height: 6, borderRadius: 3 },
  countNum: { fontSize: 13, fontWeight: '800' },

  chipDivider: { height: StyleSheet.hairlineWidth },

  chipRow: { paddingBottom: 12 },
  chipScroll: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  chipLabel: { fontSize: 12, fontWeight: '500' },

  ctrlBtn: {
    position: 'absolute',
    width: 46, height: 46,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 12, elevation: 4,
  },


  dropdown: {
    position: 'absolute', left: 0, right: 0,
    zIndex: 99,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14, shadowRadius: 20, elevation: 16,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  dropdownIcon: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: EVAC_COLOR,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dropdownIconGradient: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dropdownText: { flex: 1, gap: 3 },
  dropdownName: { fontSize: 14, fontWeight: '600' },
  dropdownAddr: { fontSize: 11.5, lineHeight: 15 },
  dropdownDistPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0,
    backgroundColor: EVAC_COLOR + '14',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20,
  },
  dropdownDistText: { fontSize: 11, fontWeight: '700', color: EVAC_COLOR },
  dropdownArrowWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.brand[500] + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  dropdownSuggestHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownSparkleWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand[500] + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  dropdownSuggestTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dropdownEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 32 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  dropdownEmptyTitle: { fontSize: 15, fontWeight: '700' },
  dropdownEmptyText: { fontSize: 12.5 },
  resultCountHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultCountBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: EVAC_COLOR,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  resultCountText: { fontSize: 11, fontWeight: '800', color: colors.white },
  resultCountLabel: { fontSize: 12, fontWeight: '600' },
  shimmerContainer: {},
  shimmerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  shimmerIcon: {
    width: 36, height: 36, borderRadius: 11,
  },
  shimmerLine: {
    height: 11, borderRadius: 6,
  },
  shimmerFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12,
  },
  shimmerFooterText: { fontSize: 12, fontWeight: '600' },


  advisoryBanner: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.feedback.advisory,
    paddingHorizontal: 14, paddingVertical: 8,
    zIndex: 50,
  },
  advisoryText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#fff' },

  hazardPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  hazardPinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});

const homeSetupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
  },
  body: {
    padding: 20,
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[500],
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
    borderRadius: 28,
  },
  successIconWrap: {
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
