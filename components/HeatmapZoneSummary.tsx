import { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import type { Severity } from '@/types';

interface ZoneReport {
  id: string;
  severity: Severity;
  hazardType?: string;
  latitude: number;
  longitude: number;
  address?: string;
  createdAt?: string;
  thumbnailUrl?: string;
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

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

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

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function HeatmapZoneSummary({ latitude, longitude, reports, radiusKm, onClose, isDark, isResponder }: Props) {
  const slideAnim = useRef(new Animated.Value(200)).current;
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
  const total = nearby.length;

  // Evidence: reports with thumbnails
  const withEvidence = nearby.filter(r => r.thumbnailUrl);

  // Time range — guard against invalid dates
  const reportedTimes = nearby
    .filter(r => r.createdAt)
    .map(r => new Date(r.createdAt!).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);
  const earliestTime = reportedTimes.length > 0 ? new Date(reportedTimes[0]).toISOString() : null;
  const latestTime = reportedTimes.length > 0 ? new Date(reportedTimes[reportedTimes.length - 1]).toISOString() : null;

  // Address
  const addresses = nearby.filter(r => r.address).map(r => r.address!);
  const locationLabel = addresses[0] ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  const bg       = isDark ? colors.dark.elevated : colors.white;
  const textMain = isDark ? colors.white : colors.slate[900];
  const textSub  = isDark ? colors.slate[400] : colors.slate[500];
  const border   = isDark ? colors.dark.border : colors.slate[100];
  const sevColor = colors.severity[maxSeverity];

  // Severity distribution bar widths
  const barSegments = SEVERITY_ORDER
    .filter(sev => bySeverity[sev] > 0)
    .map(sev => ({ sev, count: bySeverity[sev], pct: (bySeverity[sev] / total) * 100 }));

  return (
    <Animated.View style={[
      s.container,
      { backgroundColor: bg, borderTopColor: border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      {/* Severity accent bar */}
      <View style={[s.accentBar, { backgroundColor: sevColor }]} />

      <View style={s.handle} />

      {/* Header */}
      <View style={s.header}>
        <View style={[s.iconWrap, { backgroundColor: sevColor + '15' }]}>
          <Ionicons name="water" size={16} color={sevColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Text style={[s.title, { color: textMain }]}>Flood Summary</Text>
            <View style={[s.sevBadge, { backgroundColor: sevColor + '15' }]}>
              <View style={[s.sevBadgeDot, { backgroundColor: sevColor }]} />
              <Text style={[s.sevBadgeText, { color: sevColor }]}>{SEVERITY_LABEL[maxSeverity]}</Text>
            </View>
          </View>
          <Text style={[s.subtitle, { color: textSub }]} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
        <Pressable onPress={onClose} style={[s.closeBtn, { backgroundColor: isDark ? colors.dark.card : colors.slate[100] }]} hitSlop={8}>
          <Ionicons name="close" size={14} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      {/* Severity distribution bar */}
      <View>
        <View style={[s.distBar, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}>
          {barSegments.map(({ sev, pct }) => (
            <View key={sev} style={[s.distSegment, { width: `${Math.max(pct, 8)}%`, backgroundColor: colors.severity[sev] }]} />
          ))}
        </View>
        <View style={s.distLabels}>
          {barSegments.map(({ sev, count }) => (
            <View key={sev} style={s.distLabelItem}>
              <View style={[s.distLabelDot, { backgroundColor: colors.severity[sev] }]} />
              <Text style={[s.distLabelCount, { color: colors.severity[sev] }]}>{count}</Text>
              <Text style={[s.distLabelText, { color: textSub }]}>{SEVERITY_LABEL[sev]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Stats row: depth + time + reports */}
      <View style={s.statsRow}>
        {hasFloods && (
          <View style={[s.statCard, { backgroundColor: isDark ? 'rgba(21,101,192,0.08)' : '#EFF6FF', borderColor: isDark ? 'rgba(21,101,192,0.15)' : '#DBEAFE' }]}>
            <Ionicons name="water" size={16} color="#1565C0" />
            <Text style={[s.statValue, { color: '#1565C0' }]}>{FLOOD_DEPTH_EST[maxSeverity]}</Text>
            <Text style={[s.statLabel, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>Est. Depth</Text>
          </View>
        )}
        {earliestTime && (
          <View style={[s.statCard, { backgroundColor: isDark ? 'rgba(100,116,139,0.08)' : '#F8FAFC', borderColor: border }]}>
            <Ionicons name="time-outline" size={16} color={textSub} />
            <Text style={[s.statValue, { color: textMain }]}>{formatTimeAgo(earliestTime)}</Text>
            <Text style={[s.statLabel, { color: textSub }]}>
              {earliestTime !== latestTime ? `to ${formatTimeAgo(latestTime!)}` : 'Time Frame'}
            </Text>
          </View>
        )}
        <View style={[s.statCard, { backgroundColor: isDark ? 'rgba(100,116,139,0.08)' : '#F8FAFC', borderColor: border }]}>
          <Ionicons name="document-text-outline" size={16} color={textSub} />
          <Text style={[s.statValue, { color: textMain }]}>{total}</Text>
          <Text style={[s.statLabel, { color: textSub }]}>
            Report{total !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Evidence photos */}
      {withEvidence.length > 0 && (
        <View>
          <View style={s.evidenceHeader}>
            <Ionicons name="camera-outline" size={12} color={textSub} />
            <Text style={[s.evidenceTitle, { color: textSub }]}>
              Evidence ({withEvidence.length})
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.evidenceScroll}
          >
            {withEvidence.map(r => (
              <View key={r.id} style={[s.evidenceCard, { borderColor: border }]}>
                <Image
                  source={{ uri: r.thumbnailUrl }}
                  style={s.evidenceImage}
                  resizeMode="cover"
                />
                <View style={s.evidenceOverlay}>
                  <View style={[s.evidenceSevDot, { backgroundColor: colors.severity[r.severity] }]} />
                  {r.createdAt && (
                    <Text style={s.evidenceTime}>{formatTimeAgo(r.createdAt)}</Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Advice */}
      {isResponder && bySeverity.critical > 0 && (
        <View style={[s.adviceRow, { backgroundColor: colors.severity.critical + '0A' }]}>
          <Ionicons name="warning" size={13} color={colors.severity.critical} />
          <Text style={[s.adviceText, { color: colors.severity.critical }]}>
            {bySeverity.critical} critical — prioritize this zone
          </Text>
        </View>
      )}

      {!isResponder && bySeverity.critical + bySeverity.high > 0 && (
        <View style={[s.adviceRow, { backgroundColor: colors.severity.high + '0A' }]}>
          <Ionicons name="alert-circle" size={13} color={colors.severity.high} />
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
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 14,
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginHorizontal: -16,
  },
  handle: {
    width: 32, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[300],
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15, fontWeight: '700',
  },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  sevBadgeDot: {
    width: 5, height: 5, borderRadius: 3,
  },
  sevBadgeText: {
    fontSize: 10, fontWeight: '700',
  },
  subtitle: {
    fontSize: 11, marginTop: 1,
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Severity distribution bar */
  distBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
  },
  distSegment: {
    height: '100%',
    borderRadius: 3,
  },
  distLabels: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  distLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distLabelDot: {
    width: 5, height: 5, borderRadius: 3,
  },
  distLabelCount: {
    fontSize: 12, fontWeight: '800',
  },
  distLabelText: {
    fontSize: 10, fontWeight: '500',
  },

  /* Stats row */
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
  },
  statValue: {
    fontSize: 15, fontWeight: '800',
  },
  statLabel: {
    fontSize: 9, fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  /* Evidence */
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  evidenceTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  evidenceScroll: {
    gap: 8,
  },
  evidenceCard: {
    width: 90,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  evidenceImage: {
    width: '100%',
    height: '100%',
  },
  evidenceOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  evidenceSevDot: {
    width: 5, height: 5, borderRadius: 3,
  },
  evidenceTime: {
    fontSize: 8, fontWeight: '600', color: '#fff',
  },

  /* Advice */
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
