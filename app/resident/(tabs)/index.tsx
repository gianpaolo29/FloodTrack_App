import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { getAllReports, getReportDetail, getEvacuationCenters } from '@/services/api';
import type { Report as ApiReport } from '@/types';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { HeatmapZoneSummary } from '@/components/HeatmapZoneSummary';
import { HeatmapTimeScrubber } from '@/components/HeatmapTimeScrubber';

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

const FLOOD_DOT: Record<Severity, { fill: string; stroke: string; radius: number }> = {
  low:      { ...colors.floodDepth.low,      radius: 10 },
  moderate: { ...colors.floodDepth.moderate, radius: 14 },
  high:     { ...colors.floodDepth.high,     radius: 18 },
  critical: { ...colors.floodDepth.critical, radius: 22 },
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
    <View style={[bs.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 16 }]}>
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
    <View style={[evs.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 16 }]}>
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

const evs = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar: { height: 4, backgroundColor: EVAC_COLOR },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
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

export default function MapScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const mapRef  = useRef<MapView>(null);
  const { token } = useAuth();

  const [reports,            setReports]            = useState<Report[]>([]);
  const [evacCenters,        setEvacCenters]        = useState<EvacCenter[]>(FALLBACK_EVAC_CENTERS);
  const filter: HazardType = 'all';
  const [mapTypeKey,         setMapTypeKey]          = useState<MapTypeKey>('standard');
  const [selected,           setSelected]           = useState<Report | null>(null);
  const [selectedEvac,       setSelectedEvac]       = useState<EvacCenter | null>(null);
  const [layersVisible,      setLayersVisible]      = useState(false);
  const [locating,           setLocating]           = useState(false);
  const [searchQuery,        setSearchQuery]        = useState('');
  const [searchFocused,      setSearchFocused]      = useState(false);
  const [searchLoading,      setSearchLoading]      = useState(false);
  const [topCardHeight,      setTopCardHeight]      = useState(0);
  const [userLocation,       setUserLocation]       = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoUrls,          setPhotoUrls]          = useState<string[]>([]);
  const [photosLoading,      setPhotosLoading]      = useState(false);
  const [advisoryDismissed,  setAdvisoryDismissed]  = useState(false);
  const [timeScrubHours, setTimeScrubHours] = useState(0);
  const [zoneSummary, setZoneSummary] = useState<{ latitude: number; longitude: number } | null>(null);
  const heatmapOpacity = useRef(new Animated.Value(0)).current;

  // ── Search animations ─────────────────────────────────────────
  const searchFocusAnim   = useRef(new Animated.Value(0)).current;
  const dropdownAnim      = useRef(new Animated.Value(0)).current;
  const searchGlowAnim    = useRef(new Animated.Value(0)).current;
  const shimmerAnim       = useRef(new Animated.Value(0)).current;
  const searchInputRef    = useRef<TextInput>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultAnims       = useRef<Animated.Value[]>([]).current;

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
    fetchUserLocation();
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
      searchDebounceRef.current = setTimeout(() => {
        setSearchLoading(false);
        animateResultItems();
      }, 400);
    } else {
      setSearchLoading(false);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    }
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
      .then(data => setReports(data.map(fromApiReport)))
      .catch(() => {});
    getEvacuationCenters(token)
      .then(centers => {
        if (centers.length > 0) setEvacCenters(centers);
      })
      .catch(() => {});
  }, [token]);

  const filtered = filter === 'all'
    ? reports
    : reports.filter(r => r.hazardType === filter);

  const now = Date.now();
  const timeFiltered = timeScrubHours === 0
    ? filtered
    : filtered.filter(r => {
        const reportTime = new Date(r.reportedAt).getTime();
        return (now - reportTime) <= timeScrubHours * 3600000;
      });

  function handleMarkerPress(report: Report) {
    setSelected(report);
    setPhotoUrls([]);
    setSelectedEvac(null);
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

  async function fetchUserLocation() {
    if (userLocation) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch {}
  }

  const trimmed = searchQuery.trim().toLowerCase();
  const searchResults: EvacCenter[] = trimmed.length >= 2
    ? evacCenters.filter(c =>
        c.name.toLowerCase().includes(trimmed) ||
        c.address.toLowerCase().includes(trimmed) ||
        (EVAC_TYPE_META[c.type]?.label ?? c.type).toLowerCase().includes(trimmed) ||
        'evacuation'.includes(trimmed) ||
        'center'.includes(trimmed) ||
        'shelter'.includes(trimmed)
      )
    : [];

  function handleEvacResultPress(center: EvacCenter) {
    Keyboard.dismiss();
    setSearchQuery('');
    setSelectedEvac(center);
    setSelected(null);
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
          const dot = FLOOD_DOT[r.severity];
          return (
            <Circle
              key={`flood-${r.id}`}
              center={{ latitude: r.latitude, longitude: r.longitude }}
              radius={dot.radius}
              fillColor={dot.fill}
              strokeColor={dot.stroke}
              strokeWidth={1.5}
              zIndex={SEVERITY_WEIGHT[r.severity]}
            />
          );
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
      </MapView>

      <View
        style={[s.topCard, { paddingTop: insets.top + 8, backgroundColor: cardBg }]}
        onLayout={e => setTopCardHeight(e.nativeEvent.layout.height)}
      >
        <View style={s.searchRow}>
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
              placeholder="Search evacuation centers..."
              placeholderTextColor={textSub}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              returnKeyType="search"
              clearButtonMode="never"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={handleClearSearch} hitSlop={8}>
                <Animated.View style={{
                  transform: [{ rotate: searchFocusAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '90deg'],
                  }) }],
                }}>
                  <Ionicons name="close-circle" size={18} color={isDark ? colors.slate[400] : colors.slate[400]} />
                </Animated.View>
              </Pressable>
            )}
          </Animated.View>

          <View style={[s.countBadge, {
            backgroundColor: colors.severity.critical + '15',
            borderColor:     colors.severity.critical + '40',
          }]}>
            <View style={[s.countDot, { backgroundColor: colors.severity.critical }]} />
            <Text style={[s.countNum, { color: colors.severity.critical }]}>{reports.length}</Text>
          </View>
        </View>


      </View>

      {searchFocused && topCardHeight > 0 && (
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
          ) : searchResults.length === 0 ? (
            /* ── Empty state ── */
            <View style={s.dropdownEmpty}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="search-outline" size={28} color={isDark ? colors.slate[600] : colors.slate[300]} />
              </View>
              <Text style={[s.dropdownEmptyTitle, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                No results found
              </Text>
              <Text style={[s.dropdownEmptyText, { color: isDark ? colors.slate[600] : colors.slate[400] }]}>
                Try searching for "evacuation" or "school"
              </Text>
            </View>
          ) : (
            /* ── Animated results ── */
            <>
              <View style={[s.resultCountHeader, { borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                <View style={s.resultCountBadge}>
                  <Text style={s.resultCountText}>{searchResults.length}</Text>
                </View>
                <Text style={[s.resultCountLabel, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                  {searchResults.length === 1 ? 'center found' : 'centers found'}
                </Text>
              </View>
              {searchResults.map((center, idx) => {
                const distKm = userLocation
                  ? haversineKm(userLocation.latitude, userLocation.longitude, center.latitude, center.longitude)
                  : null;
                const isLast = idx === searchResults.length - 1;
                const anim = getResultAnim(idx);
                return (
                  <Animated.View
                    key={center.id}
                    style={{
                      opacity: anim,
                      transform: [{
                        translateX: anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-20, 0],
                        }),
                      }],
                    }}
                  >
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
                  </Animated.View>
                );
              })}
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
              isDark && { borderColor: colors.slate[800] },
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
              isDark && { borderColor: colors.slate[800] },
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

      {!advisoryDismissed && !selected && !selectedEvac && topCardHeight > 0 && (() => {
        const highCount = reports.filter(r => r.severity === 'critical' || r.severity === 'high').length;
        if (highCount === 0) return null;
        return (
          <View style={[s.advisoryBanner, { top: topCardHeight }]}>
            <Ionicons name="warning" size={13} color="#fff" />
            <Text style={s.advisoryText} numberOfLines={1}>
              Flood advisory: {highCount} high-risk hazard{highCount > 1 ? 's' : ''} active
            </Text>
            <Pressable onPress={() => setAdvisoryDismissed(true)} hitSlop={10}>
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        );
      })()}

      {showFloodHeatmap && !selected && !selectedEvac && !zoneSummary && (
        <View style={[s.legendFloat, { bottom: tabClear + 186 }]}>
          <HeatmapLegend mode="floodDepth" isDark={isDark} />
        </View>
      )}

      {showFloodHeatmap && !selected && !selectedEvac && !zoneSummary && (
        <View style={[s.timeScrubber, { bottom: tabClear + 14 }]}>
          <HeatmapTimeScrubber
            value={timeScrubHours}
            onTimeChange={setTimeScrubHours}
            isDark={isDark}
          />
        </View>
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  topCard: {
    position: 'absolute', top: 0, left: 0, right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 10,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.slate[50],
    borderWidth: 1.5, borderColor: colors.slate[200],
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
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
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },


  dropdown: {
    position: 'absolute', left: 0, right: 0,
    zIndex: 99,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 16,
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

  legendFloat: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
  },

  timeScrubber: {
    position: 'absolute',
    left: 12,
    right: 66,
    zIndex: 20,
  },
});
