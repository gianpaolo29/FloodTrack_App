import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

export type LegendMode = 'severity' | 'floodDepth' | 'density';

interface Props {
  mode: LegendMode;
  isDark: boolean;
  lastUpdated?: string;
  detailed?: boolean;
  counts?: { low: number; moderate: number; high: number; critical: number };
}

const SEVERITY_LABELS = ['Safe', 'Caution', 'Danger', 'Critical'];
const DEPTH_LABELS    = ['Ankle', 'Knee', 'Waist', '> 4 ft'];
const DENSITY_LABELS  = ['Sparse', '', '', 'Hotspot'];

const SEVERITY_COLORS = [colors.severity.low, colors.severity.moderate, colors.severity.high, colors.severity.critical];
const DEPTH_COLORS    = ['#90CAF9', '#42A5F5', '#1565C0', '#0D47A1'];
const DENSITY_COLORS  = ['#3B82C4', '#F4B400', '#EA6A0C', '#D32F2F'];

function getConfig(mode: LegendMode) {
  switch (mode) {
    case 'floodDepth':
      return { title: 'Flood Depth', icon: 'water' as const, colors: DEPTH_COLORS, labels: DEPTH_LABELS };
    case 'density':
      return { title: 'Incident Density', icon: 'flame' as const, colors: DENSITY_COLORS, labels: DENSITY_LABELS };
    case 'severity':
    default:
      return { title: 'Severity', icon: 'shield-checkmark' as const, colors: SEVERITY_COLORS, labels: SEVERITY_LABELS };
  }
}

export function HeatmapLegend({ mode, isDark, lastUpdated, detailed, counts }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const config = getConfig(mode);
  const bg     = isDark ? 'rgba(13,17,23,0.92)' : 'rgba(255,255,255,0.94)';
  const text   = isDark ? colors.slate[300] : colors.slate[600];
  const title  = isDark ? colors.white : colors.slate[800];

  return (
    <Animated.View style={[s.card, { backgroundColor: bg, opacity: fadeAnim }]}>
      <View style={s.header}>
        <Ionicons name={config.icon} size={12} color={config.colors[2]} />
        <Text style={[s.title, { color: title }]}>{config.title}</Text>
      </View>

      <View style={s.gradientRow}>
        {config.colors.map((c, i) => (
          <View key={i} style={[s.gradientSegment, { backgroundColor: c }]} />
        ))}
      </View>

      <View style={s.labelRow}>
        {config.labels.map((label, i) => (
          <Text key={i} style={[s.label, { color: text }]}>{label}</Text>
        ))}
      </View>

      {detailed && counts && (
        <View style={s.countsRow}>
          {(['low', 'moderate', 'high', 'critical'] as const).map(sev => (
            <View key={sev} style={[s.countPill, { backgroundColor: colors.severity[sev] + '18' }]}>
              <View style={[s.countDot, { backgroundColor: colors.severity[sev] }]} />
              <Text style={[s.countText, { color: colors.severity[sev] }]}>{counts[sev]}</Text>
            </View>
          ))}
        </View>
      )}

      {lastUpdated && (
        <View style={s.updatedRow}>
          <Ionicons name="time-outline" size={9} color={colors.slate[400]} />
          <Text style={[s.updatedText, { color: colors.slate[400] }]}>{lastUpdated}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 160,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  gradientRow: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gradientSegment: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
  },
  countsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  countPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 3,
    borderRadius: 6,
  },
  countDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  updatedText: {
    fontSize: 8,
    fontWeight: '500',
  },
});
