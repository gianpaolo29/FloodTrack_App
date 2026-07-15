import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getAssignedIncidents, getEvacuationCenters, getActiveHazards } from '@/services/api';
import type { Incident, ResponderStatus, Severity, Hazard } from '@/types';
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

// Flood-type RGB values matching web admin blue palette (dark navy → light blue)
const FLOOD_TYPE_RGB: Record<string, string> = {
  flash_flood:   '13,71,161',   // #0D47A1 dark navy
  river_flood:   '21,101,192',  // #1565C0 medium blue
  coastal_flood: '2,119,189',   // #0277BD sky blue
  urban_flood:   '66,165,245',  // #42A5F5 light blue
};
const FLOOD_TYPE_DEFAULT_RGB = '21,101,192'; // fallback for unclassified flood incidents


type MapTypeKey = MapType | 'flood';

const MAP_TYPES: { key: MapTypeKey; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { key: 'standard',  label: 'Default',   icon: 'map-outline',    desc: 'Road map'           },
  { key: 'satellite', label: 'Satellite', icon: 'planet-outline', desc: 'Aerial imagery'     },
  { key: 'hybrid',    label: 'Hybrid',    icon: 'globe-outline',  desc: 'Satellite + labels' },
  { key: 'terrain',   label: 'Terrain',   icon: 'layers-outline', desc: 'Topographic'        },
  { key: 'flood',     label: 'Flood',     icon: 'water',          desc: 'Severity heatmap'   },
];

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

interface EvacCenter {
  id: string;
  name: string;
  address: string;
  type: string;
  capacity: number;
  latitude: number;
  longitude: number;
}

const EVAC_TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  school:           { icon: 'school',          label: 'School'           },
  gymnasium:        { icon: 'fitness',         label: 'Gymnasium'        },
  barangay_hall:    { icon: 'business',        label: 'Barangay Hall'    },
  covered_court:    { icon: 'tennisball',      label: 'Covered Court'    },
  church:           { icon: 'location',        label: 'Church'           },
  community_center: { icon: 'people',          label: 'Community Center' },
};

const EVAC_COLOR = '#0E9E6E';

const FALLBACK_EVAC_CENTERS: EvacCenter[] = [
  { id: 'evac-1', name: 'Nasugbu Municipal Gymnasium', address: 'J.P. Laurel St., Poblacion, Nasugbu, Batangas', type: 'gymnasium', capacity: 1200, latitude: 14.07780, longitude: 120.63820 },
  { id: 'evac-2', name: 'Nasugbu West Central School', address: 'Concepcion St., Brgy. IV, Nasugbu, Batangas', type: 'school', capacity: 2000, latitude: 14.07362, longitude: 120.63332 },
  { id: 'evac-3', name: 'Nasugbu East Central School', address: 'Poblacion, Nasugbu, Batangas', type: 'school', capacity: 900, latitude: 14.07620, longitude: 120.63680 },
  { id: 'evac-4', name: 'Nasugbu National High School', address: 'Brgy. Poblacion, Nasugbu, Batangas', type: 'school', capacity: 1500, latitude: 14.08100, longitude: 120.63900 },
  { id: 'evac-5', name: 'Pantalan Elementary School', address: 'Brgy. Pantalan, Nasugbu, Batangas', type: 'school', capacity: 450, latitude: 14.08560, longitude: 120.62950 },
  { id: 'evac-6', name: 'Pantalan Senior High School', address: 'Brgy. Pantalan, Nasugbu, Batangas', type: 'school', capacity: 600, latitude: 14.08720, longitude: 120.62870 },
  { id: 'evac-7', name: 'Banilad Elementary School', address: 'Brgy. Banilad, Nasugbu, Batangas', type: 'school', capacity: 380, latitude: 14.07920, longitude: 120.62780 },
  { id: 'evac-8', name: 'Munting Indang Elementary School', address: 'Brgy. Munting Indang, Nasugbu, Batangas', type: 'school', capacity: 350, latitude: 14.06650, longitude: 120.64220 },
  { id: 'evac-9', name: 'Kaylaway Elementary School', address: 'Brgy. Kaylaway, Nasugbu, Batangas', type: 'school', capacity: 420, latitude: 14.09750, longitude: 120.64780 },
  { id: 'evac-10', name: 'Kaylaway National High School', address: 'Brgy. Kaylaway, Nasugbu, Batangas', type: 'school', capacity: 700, latitude: 14.09650, longitude: 120.64950 },
  { id: 'evac-11', name: 'Riparo Elementary School', address: 'Brgy. Riparo, Nasugbu, Batangas', type: 'school', capacity: 320, latitude: 14.05650, longitude: 120.64480 },
  { id: 'evac-12', name: 'Bilaran High School', address: 'Catandaan, Brgy. Bilaran, Nasugbu, Batangas', type: 'school', capacity: 550, latitude: 14.05400, longitude: 120.63100 },
  { id: 'evac-13', name: 'BatStateU Nasugbu Campus', address: 'Brgy. Lanas, Nasugbu, Batangas', type: 'school', capacity: 1800, latitude: 14.07450, longitude: 120.63560 },
  { id: 'evac-14', name: 'Aga Elementary School', address: 'Brgy. Aga, Nasugbu, Batangas', type: 'school', capacity: 280, latitude: 14.06300, longitude: 120.62600 },
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
    <View style={markerStyles.wrapper}>
      {isCrit && <PulseRing color={sevColor} />}
      <View style={[markerStyles.circle, { backgroundColor: sevColor }]}>
        <Ionicons name="shield-checkmark" size={13} color={colors.white} />
      </View>
      <View style={[markerStyles.statusRing, { backgroundColor: statusColor, borderColor: colors.white }]} />
    </View>
  );
}

const markerStyles = StyleSheet.create({
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

function EvacuationMarker() {
  return (
    <View style={evacMarker.wrapper}>
      <View style={evacMarker.circle}>
        <Ionicons name="shield-checkmark" size={13} color={colors.white} />
      </View>
    </View>
  );
}

const evacMarker = StyleSheet.create({
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
  visible, current, onSelect, onClose, isDark,
}: {
  visible: boolean;
  current: MapTypeKey;
  onSelect: (t: MapTypeKey) => void;
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
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
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
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:      { width: '22%' as any, flexGrow: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 8 },
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
    <View style={[sheetStyles.root, { backgroundColor: bg, paddingBottom: bottomInset + 16 }]}>
      <View style={[sheetStyles.accentBar, { backgroundColor: sevColor }]} />
      <View style={sheetStyles.handle} />

      <View style={sheetStyles.header}>
        <View style={[sheetStyles.iconWrap, { backgroundColor: sevColor + '14' }]}>
          <Ionicons name="shield-checkmark" size={22} color={sevColor} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={sheetStyles.refRow}>
            <View style={[sheetStyles.refDot, { backgroundColor: sevColor }]} />
            <Text style={[sheetStyles.ref, { color: textSub }]}>{incident.reference}</Text>
          </View>
          <Text style={[sheetStyles.title, { color: textMain }]} numberOfLines={2}>
            {incident.title}
          </Text>
          <View style={sheetStyles.addressRow}>
            <Ionicons name="location" size={12} color={colors.accent[500]} />
            <Text style={[sheetStyles.address, { color: textSub }]} numberOfLines={1}>
              {incident.address}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={[sheetStyles.closeBtn, { backgroundColor: isDark ? colors.dark.card : colors.slate[100] }]}
          hitSlop={8} accessibilityLabel="Close"
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      <View style={[sheetStyles.divider, { backgroundColor: sepColor }]} />

      <View style={sheetStyles.pillRow}>
        <SeverityChip level={incident.severity} size="sm" />
        <View style={[sheetStyles.statusPill, { backgroundColor: statusColor + '14' }]}>
          <Ionicons name={statusIcon} size={11} color={statusColor} />
          <Text style={[sheetStyles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[incident.responderStatus]}
          </Text>
        </View>
        {distanceKm !== null && (
          <View style={[sheetStyles.distPill, isDark && { backgroundColor: colors.dark.card }]}>
            <Ionicons name="navigate" size={10} color={colors.accent[500]} />
            <Text style={[sheetStyles.distText, { color: colors.accent[500] }]}>{fmtDist(distanceKm)}</Text>
          </View>
        )}
        {incident.nearbyCount > 1 && (
          <View style={[sheetStyles.nearbyPill, isDark && { backgroundColor: colors.severity.moderate + '14' }]}>
            <Ionicons name="warning" size={10} color={colors.severity.moderate} />
            <Text style={{ fontSize: 10, color: colors.severity.moderate, fontWeight: '700' }}>
              {incident.nearbyCount} nearby
            </Text>
          </View>
        )}
      </View>

      <View style={sheetStyles.actions}>
        <Pressable
          style={({ pressed }) => [sheetStyles.navBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={onNavigate}
          accessibilityLabel="Navigate to incident"
        >
          <Ionicons name="navigate" size={16} color={colors.white} />
          <Text style={sheetStyles.navBtnText}>Navigate</Text>
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

const sheetStyles = StyleSheet.create({
  root: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
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

function EvacSheet({
  center, onClose, onGetDirections, isDark, bottomInset, distanceKm,
}: {
  center: EvacCenter;
  onClose: () => void;
  onGetDirections: () => void;
  isDark: boolean;
  bottomInset: number;
  distanceKm: number | null;
}) {
  const bg       = isDark ? colors.dark.elevated : colors.white;
  const textMain = isDark ? colors.white         : colors.slate[900];
  const textSub  = isDark ? colors.slate[400]    : colors.slate[500];
  const sepColor = isDark ? colors.dark.border   : colors.slate[100];
  const meta     = EVAC_TYPE_META[center.type] ?? { icon: 'location' as const, label: center.type };

  return (
    <View style={[evacSheet.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 16 }]}>
      <View style={evacSheet.accentBar} />
      <View style={evacSheet.handle} />

      <View style={evacSheet.header}>
        <View style={evacSheet.iconWrap}>
          <Ionicons name="shield-checkmark" size={24} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[evacSheet.typeLabel, { color: EVAC_COLOR }]}>
            EVACUATION CENTER · {meta.label.toUpperCase()}
          </Text>
          <Text style={[evacSheet.title, { color: textMain }]} numberOfLines={2}>
            {center.name}
          </Text>
          <View style={evacSheet.addressRow}>
            <Ionicons name="location-sharp" size={12} color={EVAC_COLOR} />
            <Text style={[evacSheet.address, { color: textSub }]} numberOfLines={1}>
              {center.address}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={[evacSheet.closeBtn, { backgroundColor: isDark ? colors.dark.card : colors.slate[100] }]}
          hitSlop={8} accessibilityLabel="Close"
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      <View style={[evacSheet.divider, { backgroundColor: sepColor }]} />

      <View style={evacSheet.statsRow}>
        <View style={[evacSheet.statPill, { backgroundColor: EVAC_COLOR + '18' }]}>
          <Ionicons name="people" size={14} color={EVAC_COLOR} />
          <Text style={[evacSheet.statText, { color: EVAC_COLOR }]}>
            Capacity {center.capacity.toLocaleString()}
          </Text>
        </View>
        {distanceKm !== null && (
          <View style={[evacSheet.statPill, { backgroundColor: colors.brand[500] + '18' }]}>
            <Ionicons name="walk" size={14} color={colors.brand[500]} />
            <Text style={[evacSheet.statText, { color: colors.brand[500] }]}>
              ~{fmtDist(distanceKm)} away
            </Text>
          </View>
        )}
        <View style={[evacSheet.statPill, { backgroundColor: EVAC_COLOR + '18' }]}>
          <Ionicons name="checkmark-circle" size={14} color={EVAC_COLOR} />
          <Text style={[evacSheet.statText, { color: EVAC_COLOR }]}>Open</Text>
        </View>
      </View>

      <View style={evacSheet.actions}>
        <Pressable
          style={({ pressed }) => [evacSheet.dirBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={onGetDirections}
          accessibilityLabel="Get directions"
        >
          <Ionicons name="navigate" size={16} color={colors.white} />
          <Text style={evacSheet.dirBtnText}>Start — Get Directions</Text>
        </Pressable>
      </View>
    </View>
  );
}

const evacSheet = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar:  { height: 4, backgroundColor: EVAC_COLOR },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  header:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: EVAC_COLOR,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  typeLabel:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title:      { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address:    { fontSize: 12, flex: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  divider:   { height: StyleSheet.hairlineWidth, marginBottom: 14 },
  statsRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  statText: { fontSize: 13, fontWeight: '600' },
  actions:  { paddingHorizontal: 16, paddingTop: 12 },
  dirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: EVAC_COLOR,
    paddingVertical: 14, borderRadius: 14,
  },
  dirBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});

export default function ResponderMapScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const mapRef  = useRef<MapView>(null);
  const { token } = useAuth();

  const [incidents,      setIncidents]      = useState<Incident[]>([]);
  const [adminHazards,   setAdminHazards]   = useState<Hazard[]>([]);
  const [evacCenters,    setEvacCenters]    = useState<EvacCenter[]>(FALLBACK_EVAC_CENTERS);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<StatusFilter>('all');
  const [mapTypeKey,     setMapTypeKey]     = useState<MapTypeKey>('standard');
  const [selected,       setSelected]       = useState<Incident | null>(null);
  const [selectedEvac,   setSelectedEvac]   = useState<EvacCenter | null>(null);
  const [layersVisible,  setLayersVisible]  = useState(false);
  const [locating,       setLocating]       = useState(false);
  const [userLocation,   setUserLocation]   = useState<{ latitude: number; longitude: number } | null>(null);
  const [timeScrubHours, setTimeScrubHours] = useState(0);
  const [zoneSummary,    setZoneSummary]    = useState<{ latitude: number; longitude: number } | null>(null);
  const [topCardHeight,  setTopCardHeight]  = useState(0);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchFocused,  setSearchFocused]  = useState(false);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [advisoryDismissed, setAdvisoryDismissed] = useState(false);
  const heatmapOpacity = useRef(new Animated.Value(0)).current;

  const searchFocusAnim   = useRef(new Animated.Value(0)).current;
  const dropdownAnim      = useRef(new Animated.Value(0)).current;
  const searchGlowAnim    = useRef(new Animated.Value(0)).current;
  const shimmerAnim       = useRef(new Animated.Value(0)).current;
  const searchInputRef    = useRef<TextInput>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultAnims       = useRef<Animated.Value[]>([]).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1, duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

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
    resultAnims.forEach(a => a.setValue(0));
    const anims = resultAnims.slice(0, 8).map((a, i) =>
      Animated.timing(a, {
        toValue: 1, duration: 260, delay: i * 50,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
  }

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
      duration: 300, useNativeDriver: true,
    }).start();
  }, [showFloodHeatmap, heatmapOpacity]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await getAssignedIncidents(token);
      setIncidents(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    getEvacuationCenters(token)
      .then(centers => {
        if (centers.length > 0) setEvacCenters(centers);
      })
      .catch(() => {});
    getActiveHazards(token)
      .then(setAdminHazards)
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getLastKnownPositionAsync() ??
          await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
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

  const criticalCount = active.filter(i => i.severity === 'critical').length;

  function handleMarkerPress(incident: Incident) {
    setSelected(incident);
    setSelectedEvac(null);
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

  async function fetchUserLocation() {
    if (userLocation) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getLastKnownPositionAsync() ??
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
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

  const cardBg   = isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)';
  const ctrlBg   = isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)';
  const textSub  = isDark ? colors.slate[400]      : colors.slate[500];
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
          if (showFloodHeatmap && e?.nativeEvent?.coordinate) {
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
        {showFloodHeatmap && [
          { key: 'flash_flood',   rgb: '13,71,161'  },
          { key: 'river_flood',   rgb: '21,101,192' },
          { key: 'coastal_flood', rgb: '2,119,189'  },
          { key: 'urban_flood',   rgb: '66,165,245' },
        ].flatMap(({ key, rgb }) => {
          const pts = [
            ...timeFilteredActive.filter(i => i.type === key),
            ...adminHazards.filter(hz => hz.category === 'flood' && hz.type === key),
          ].map(src => ({
            latitude:  src.latitude,
            longitude: src.longitude,
            weight:    SEVERITY_WEIGHT[src.severity],
          }));
          if (pts.length === 0) return [];
          return [(
            <Heatmap
              key={`hm-${key}`}
              points={pts}
              radius={55}
              opacity={0.78}
              gradient={{
                colors:      [`rgba(${rgb},0)`, `rgba(${rgb},0.55)`, `rgba(${rgb},0.95)`],
                startPoints: [0, 0.38, 1],
                colorMapSize: 256,
              }}
            />
          )];
        })}

        {/* Catch-all heatmap for incidents whose type isn't a known flood subtype */}
        {showFloodHeatmap && (() => {
          const known = ['flash_flood', 'river_flood', 'coastal_flood', 'urban_flood'];
          const pts = [
            ...timeFilteredActive.filter(i => !known.includes(i.type)),
            ...adminHazards.filter(hz => hz.category === 'flood' && !known.includes(hz.type)),
          ].map(src => ({
            latitude:  src.latitude,
            longitude: src.longitude,
            weight:    SEVERITY_WEIGHT[src.severity],
          }));
          if (pts.length === 0) return null;
          const rgb = FLOOD_TYPE_DEFAULT_RGB;
          return (
            <Heatmap
              key="hm-default"
              points={pts}
              radius={55}
              opacity={0.78}
              gradient={{
                colors:      [`rgba(${rgb},0)`, `rgba(${rgb},0.55)`, `rgba(${rgb},0.95)`],
                startPoints: [0, 0.38, 1],
                colorMapSize: 256,
              }}
            />
          );
        })()}

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
      </MapView>

      <View
        style={[s.topCard, { paddingTop: insets.top + 8, backgroundColor: cardBg }]}
        onLayout={e => setTopCardHeight(e.nativeEvent.layout.height)}
      >
        <View style={s.searchRow}>
          <Animated.View style={[
            s.searchBar,
            isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
            searchQuery.length > 0 && { borderColor: EVAC_COLOR },
            {
              borderColor: searchFocusAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [isDark ? colors.dark.border : colors.slate[200], colors.accent[500]],
              }),
              shadowOpacity: searchFocusAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.18],
              }),
              shadowRadius: searchFocusAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 16],
              }),
              shadowColor: colors.accent[500],
              shadowOffset: { width: 0, height: 0 },
              elevation: searchFocused ? 6 : 0,
            },
          ]}>
            {searchFocused && (
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: colors.accent[500],
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
                color={searchQuery.length > 0 ? EVAC_COLOR : searchFocused ? colors.accent[500] : colors.slate[400]}
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
                  <Ionicons name="close-circle" size={18} color={colors.slate[400]} />
                </Animated.View>
              </Pressable>
            )}
          </Animated.View>

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
          <LinearGradient
            colors={[colors.accent[500], EVAC_COLOR]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 2 }}
          />

          {trimmed.length < 2 ? (
            <>
              <View style={[s.dropdownSuggestHeader, { borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                <View style={s.dropdownSparkleWrap}>
                  <Ionicons name="sparkles" size={12} color={colors.accent[500]} />
                </View>
                <Text style={[s.dropdownSuggestTitle, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                  Quick search
                </Text>
              </View>
              {[
                { icon: 'shield-checkmark' as const, label: 'Evacuation centers near me', query: 'evacuation', gradient: [EVAC_COLOR, '#059669'] as [string, string] },
                { icon: 'school'           as const, label: 'Schools',                    query: 'school',     gradient: [colors.accent[500], '#6366F1'] as [string, string] },
                { icon: 'fitness'          as const, label: 'Gymnasium',                  query: 'gymnasium',  gradient: ['#F59E0B', '#EA580C'] as [string, string] },
                { icon: 'people'           as const, label: 'High-capacity shelters',     query: 'high',       gradient: ['#A855F7', '#7C3AED'] as [string, string] },
              ].map((s2, idx, arr) => (
                <Pressable
                  key={s2.query}
                  style={({ pressed }) => [
                    s.dropdownItem,
                    idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] },
                    pressed && { backgroundColor: isDark ? colors.dark.card : colors.accent[500] + '08', transform: [{ scale: 0.98 }] },
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
                    <Ionicons name="arrow-forward" size={12} color={colors.accent[500]} />
                  </View>
                </Pressable>
              ))}
            </>
          ) : searchLoading ? (
            <View style={s.shimmerContainer}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[s.shimmerRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                  <Animated.View style={[
                    s.shimmerIcon,
                    {
                      backgroundColor: isDark ? colors.dark.card : colors.slate[200],
                      opacity: shimmerAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.4, 1, 0.4],
                      }),
                    },
                  ]} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Animated.View style={[
                      s.shimmerLine,
                      { width: `${70 - i * 12}%` as any, backgroundColor: isDark ? colors.dark.card : colors.slate[200] },
                      { opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) },
                    ]} />
                    <Animated.View style={[
                      s.shimmerLine,
                      { width: `${90 - i * 8}%` as any, height: 8, backgroundColor: isDark ? colors.dark.card : colors.slate[200] },
                      { opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.8, 0.3] }) },
                    ]} />
                  </View>
                </View>
              ))}
              <View style={s.shimmerFooter}>
                <ActivityIndicator size="small" color={colors.accent[500]} />
                <Text style={[s.shimmerFooterText, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>
                  Searching...
                </Text>
              </View>
            </View>
          ) : searchResults.length === 0 ? (
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
              { bottom: tabClear + 68, right: 12, backgroundColor: ctrlBg },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setLayersVisible(true)}
            accessibilityLabel="Map layers"
          >
            <Ionicons
              name="layers-outline" size={22}
              color={mapTypeKey !== 'standard' ? colors.accent[500] : (isDark ? colors.slate[300] : colors.slate[700])}
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
              ? <ActivityIndicator size="small" color={colors.accent[500]} />
              : <Ionicons name="locate" size={20} color={colors.accent[500]} />
            }
          </Pressable>
        </>
      )}

      {!loading && active.length === 0 && !selected && !selectedEvac && (
        <View style={[s.emptyOverlay, { bottom: tabClear + 14 }]}>
          <View style={[s.emptyCard, { backgroundColor: isDark ? colors.dark.card : colors.white }]}>
            <View style={[s.emptyCardIcon, { backgroundColor: colors.severity.low + '18' }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.severity.low} />
            </View>
            <View>
              <Text style={[s.emptyTitle, isDark && { color: colors.white }]}>All clear</Text>
              <Text style={[s.emptySub, isDark && { color: colors.slate[500] }]}>No active incidents</Text>
            </View>
          </View>
        </View>
      )}

      {!advisoryDismissed && !selected && !selectedEvac && topCardHeight > 0 && (() => {
        const highCount = active.filter(i => i.severity === 'critical' || i.severity === 'high').length;
        if (highCount === 0) return null;
        return (
          <View style={[s.advisoryBanner, { top: topCardHeight }]}>
            <Ionicons name="warning" size={13} color="#fff" />
            <Text style={s.advisoryText} numberOfLines={1}>
              {highCount} high-risk incident{highCount > 1 ? 's' : ''} — immediate response needed
            </Text>
            <Pressable onPress={() => setAdvisoryDismissed(true)} hitSlop={10}>
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        );
      })()}

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

      {showFloodHeatmap && !selected && !selectedEvac && !zoneSummary && (
        <View style={[s.legendFloat, { bottom: tabClear + 186 }]}>
          {(() => {
            const floodSources = [
              ...timeFilteredActive,
              ...adminHazards.filter(hz => hz.category === 'flood'),
            ];
            return (
              <HeatmapLegend
                mode="floodType"
                isDark={isDark}
                detailed
                floodTypeCounts={{
                  flash_flood:   floodSources.filter(x => x.type === 'flash_flood').length,
                  river_flood:   floodSources.filter(x => x.type === 'river_flood').length,
                  coastal_flood: floodSources.filter(x => x.type === 'coastal_flood').length,
                  urban_flood:   floodSources.filter(x => x.type === 'urban_flood').length,
                }}
              />
            );
          })()}
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
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
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
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
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
    width: 46, height: 46, borderRadius: 16,
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
  emptyCardIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  emptySub:   { fontSize: 12, color: colors.slate[400] },

  advisoryBanner: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.severity.critical,
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

  dropdown: {
    position: 'absolute', left: 0, right: 0,
    zIndex: 99,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 16,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
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
    backgroundColor: colors.accent[500] + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  dropdownSuggestHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownSparkleWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accent[500] + '14',
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
  shimmerIcon: { width: 36, height: 36, borderRadius: 11 },
  shimmerLine: { height: 11, borderRadius: 6 },
  shimmerFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12,
  },
  shimmerFooterText: { fontSize: 12, fontWeight: '600' },

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
