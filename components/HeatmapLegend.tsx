import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';

export type LegendMode = 'severity' | 'floodDepth' | 'density' | 'floodType';

export interface FloodTypeCounts {
  flash_flood: number;
  river_flood: number;
  coastal_flood: number;
  urban_flood: number;
}

interface Props {
  mode: LegendMode;
  isDark: boolean;
  lastUpdated?: string;
  detailed?: boolean;
  counts?: { low: number; moderate: number; high: number; critical: number };
  floodTypeCounts?: FloodTypeCounts;
}

const SEVERITY_LABELS  = ['Safe', 'Caution', 'Danger', 'Critical'];
const DEPTH_LABELS     = ['Ankle', 'Knee', 'Waist', '> 4 ft'];
const DENSITY_LABELS   = ['Sparse', '', '', 'Hotspot'];
const FLOOD_TYPE_LABELS = ['Flash', 'River', 'Coastal', 'Urban'];

const SEVERITY_COLORS   = [colors.severity.low, colors.severity.moderate, colors.severity.high, colors.severity.critical];
const DEPTH_COLORS      = colors.floodDepth.gradient.slice(1);
const DENSITY_COLORS    = [colors.heatmap[0], colors.heatmap[2], colors.heatmap[3], colors.heatmap[4]];
const FLOOD_TYPE_COLORS = [
  colors.floodHazard.flashFlood,
  colors.floodHazard.riverFlood,
  colors.floodHazard.coastalFlood,
  colors.floodHazard.urbanFlood,
];

const FLOOD_TYPE_DEFS = [
  { key: 'flash_flood' as const,   label: 'Flash',   icon: 'thunderstorm' as const, color: colors.floodHazard.flashFlood },
  { key: 'river_flood' as const,   label: 'River',   icon: 'water' as const,        color: colors.floodHazard.riverFlood },
  { key: 'coastal_flood' as const, label: 'Coastal', icon: 'boat' as const,         color: colors.floodHazard.coastalFlood },
  { key: 'urban_flood' as const,   label: 'Urban',   icon: 'business' as const,     color: colors.floodHazard.urbanFlood },
];

function getConfig(mode: LegendMode) {
  switch (mode) {
    case 'floodDepth':
      return { title: 'Flood Depth',      icon: 'water' as const,            colors: [...DEPTH_COLORS],     labels: DEPTH_LABELS     };
    case 'density':
      return { title: 'Incident Density', icon: 'flame' as const,            colors: DENSITY_COLORS,        labels: DENSITY_LABELS   };
    case 'floodType':
      return { title: 'Flood Type',       icon: 'water' as const,            colors: FLOOD_TYPE_COLORS,     labels: FLOOD_TYPE_LABELS };
    case 'severity':
    default:
      return { title: 'Severity',         icon: 'shield-checkmark' as const, colors: SEVERITY_COLORS,       labels: SEVERITY_LABELS  };
  }
}

export function HeatmapLegend({ mode, isDark, lastUpdated, detailed, counts, floodTypeCounts }: Props) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const config = getConfig(mode);
  const bg     = isDark ? colors.overlay.heatmapCardDark : colors.overlay.heatmapCardLight;
  const text   = isDark ? colors.slate[400] : colors.slate[500];
  const title  = isDark ? colors.slate[200] : colors.slate[700];
  const border = isDark ? colors.overlay.heatmapBorderDark : colors.overlay.heatmapBorderLight;

  return (
    <Animated.View
      style={[
        s.card,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={s.header}>
        <View style={[s.iconWrap, { backgroundColor: config.colors[2] + '18' }]}>
          <Ionicons name={config.icon} size={11} color={config.colors[2]} />
        </View>
        <Text style={[s.title, { color: title }]}>{config.title}</Text>
      </View>

      <View style={s.gradientWrap}>
        <LinearGradient
          colors={config.colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.gradient}
        />
      </View>

      <View style={s.labelRow}>
        {config.labels.map((label, i) => (
          <Text key={i} style={[s.label, { color: text }]}>{label}</Text>
        ))}
      </View>

      {detailed && mode === 'floodType' && floodTypeCounts && (
        <View style={s.countsRow}>
          {FLOOD_TYPE_DEFS.map(ft => (
            <View key={ft.key} style={[s.countPill, { backgroundColor: ft.color + '18' }]}>
              <Ionicons name={ft.icon} size={9} color={ft.color} />
              <Text style={[s.countText, { color: ft.color }]}>{floodTypeCounts[ft.key]}</Text>
            </View>
          ))}
        </View>
      )}

      {detailed && mode !== 'floodType' && counts && (
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
    borderRadius: 14,
    padding: 12,
    gap: 7,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
    minWidth: 180,
    maxWidth: 220,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gradientWrap: {
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 2,
  },
  gradient: {
    height: 10,
    borderRadius: 5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.1,
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
