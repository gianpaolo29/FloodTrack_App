import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import type { Severity } from '@/types';

interface ZoneReport {
  id: string;
  severity: Severity;
  hazardType?: string;
  latitude: number;
  longitude: number;
}

interface Props {
  latitude: number;
  longitude: number;
  reports: ZoneReport[];
  radiusKm: number;
  onClose: () => void;
  isDark: boolean;
  isResponder?: boolean;
}

const FLOOD_DEPTH_EST: Record<Severity, string> = {
  low:      '~1 ft',
  moderate: '~2 ft',
  high:     '~3 ft',
  critical: '>4 ft',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'moderate', 'low'];

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

export function HeatmapZoneSummary({ latitude, longitude, reports, radiusKm, onClose, isDark, isResponder }: Props) {
  const slideAnim = useRef(new Animated.Value(120)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  const nearby = reports.filter(r =>
    haversineKm(latitude, longitude, r.latitude, r.longitude) <= radiusKm
  );

  if (nearby.length === 0) return null;

  const bySeverity: Record<Severity, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
  nearby.forEach(r => { bySeverity[r.severity]++; });

  const floodReports = nearby.filter(r => r.hazardType === 'flood');
  const hasFloods = floodReports.length > 0;

  const maxSeverity = SEVERITY_ORDER.find(s => bySeverity[s] > 0) ?? 'low';

  const bg       = isDark ? colors.dark.elevated : colors.white;
  const textMain = isDark ? colors.white : colors.slate[900];
  const textSub  = isDark ? colors.slate[400] : colors.slate[500];
  const border   = isDark ? colors.dark.border : colors.slate[100];

  return (
    <Animated.View style={[
      s.container,
      { backgroundColor: bg, borderTopColor: border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      <View style={s.handle} />

      <View style={s.header}>
        <View style={[s.iconWrap, { backgroundColor: colors.severity[maxSeverity] + '18' }]}>
          <Ionicons name="analytics" size={18} color={colors.severity[maxSeverity]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: textMain }]}>Zone Summary</Text>
          <Text style={[s.subtitle, { color: textSub }]}>
            {nearby.length} report{nearby.length !== 1 ? 's' : ''} within {radiusKm < 1 ? `${Math.round(radiusKm * 1000)}m` : `${radiusKm.toFixed(1)}km`}
          </Text>
        </View>
        <Pressable onPress={onClose} style={[s.closeBtn, { backgroundColor: isDark ? colors.dark.card : colors.slate[100] }]} hitSlop={8}>
          <Ionicons name="close" size={14} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      <View style={s.breakdownRow}>
        {SEVERITY_ORDER.map(sev => {
          const count = bySeverity[sev];
          if (count === 0) return null;
          return (
            <View key={sev} style={[s.breakdownPill, { backgroundColor: colors.severity[sev] + '14' }]}>
              <View style={[s.breakdownDot, { backgroundColor: colors.severity[sev] }]} />
              <Text style={[s.breakdownCount, { color: colors.severity[sev] }]}>{count}</Text>
              <Text style={[s.breakdownLabel, { color: colors.severity[sev] }]}>
                {sev.charAt(0).toUpperCase() + sev.slice(1)}
              </Text>
            </View>
          );
        })}
      </View>

      {hasFloods && (
        <View style={[s.depthRow, { borderColor: border }]}>
          <Ionicons name="water" size={14} color="#1565C0" />
          <Text style={[s.depthLabel, { color: textSub }]}>Est. flood depth</Text>
          <Text style={[s.depthValue, { color: '#1565C0' }]}>{FLOOD_DEPTH_EST[maxSeverity]}</Text>
        </View>
      )}

      {isResponder && bySeverity.critical > 0 && (
        <View style={[s.adviceRow, { backgroundColor: colors.severity.critical + '0D' }]}>
          <Ionicons name="warning" size={12} color={colors.severity.critical} />
          <Text style={[s.adviceText, { color: colors.severity.critical }]}>
            {bySeverity.critical} critical — prioritize this zone
          </Text>
        </View>
      )}

      {!isResponder && bySeverity.critical + bySeverity.high > 0 && (
        <View style={[s.adviceRow, { backgroundColor: colors.severity.high + '0D' }]}>
          <Ionicons name="alert-circle" size={12} color={colors.severity.high} />
          <Text style={[s.adviceText, { color: colors.severity.high }]}>
            Avoid this area if possible
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingBottom: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 14,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[300],
    alignSelf: 'center', marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 15, fontWeight: '700',
  },
  subtitle: {
    fontSize: 12, marginTop: 1,
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  breakdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  breakdownDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  breakdownCount: {
    fontSize: 13, fontWeight: '800',
  },
  breakdownLabel: {
    fontSize: 11, fontWeight: '500',
  },
  depthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#1565C00D',
  },
  depthLabel: {
    fontSize: 12, flex: 1,
  },
  depthValue: {
    fontSize: 13, fontWeight: '700',
  },
  adviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  adviceText: {
    fontSize: 12, fontWeight: '600', flex: 1,
  },
});
