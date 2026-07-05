import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

type Config = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const SEVERITY_CONFIG: Record<Severity, Config> = {
  low:      { label: 'Low',      icon: 'information-circle', color: colors.severity.low      },
  moderate: { label: 'Moderate', icon: 'warning',            color: colors.severity.moderate },
  high:     { label: 'High',     icon: 'alert-circle',       color: colors.severity.high     },
  critical: { label: 'Critical', icon: 'alert',              color: colors.severity.critical },
};

interface Props {
  level: Severity;
  size?: 'sm' | 'md' | 'lg';
}

export function SeverityChip({ level, size = 'md' }: Props) {
  const cfg = SEVERITY_CONFIG[level];
  const isCritical = level === 'critical';

  const iconSize   = size === 'sm' ? 12 : size === 'lg' ? 17 : 14;
  const fontSize   = size === 'sm' ? 11 : size === 'lg' ? 14 : 12;
  const px         = size === 'sm' ? 7  : size === 'lg' ? 12 : 9;
  const py         = size === 'sm' ? 3  : size === 'lg' ? 6  : 4;
  const radius     = size === 'sm' ? 5  : 7;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isCritical ? cfg.color : cfg.color + '22',
          borderColor:      cfg.color,
          paddingHorizontal: px,
          paddingVertical:   py,
          borderRadius:      radius,
        },
      ]}
      accessibilityLabel={`Severity: ${cfg.label}`}
      accessibilityRole="text"
    >
      <Ionicons
        name={cfg.icon}
        size={iconSize}
        color={isCritical ? colors.white : cfg.color}
      />
      <Text
        style={[
          styles.label,
          { color: isCritical ? colors.white : cfg.color, fontSize },
        ]}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
