/**
 * PrimaryButton
 * Reusable action button. Variants:
 *   'primary'   → brand blue  (main CTA)
 *   'secondary' → accent teal (map / responder secondary actions)
 *   'danger'    → NOT severity red — only for destructive actions like delete/reject
 *                 (severity red stays exclusively on SeverityChip / pins)
 */
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';

type Variant = 'primary' | 'secondary' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

const BG: Record<Variant, string> = {
  primary:   colors.brand[500],
  secondary: colors.accent[500],
  danger:    '#B71C1C',
};

const PRESSED_BG: Record<Variant, string> = {
  primary:   colors.brand[700],
  secondary: colors.accent[700],
  danger:    '#7F0000',
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
}: Props) {
  const height    = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;
  const fontSize  = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;
  const radius    = size === 'sm' ? 10 : size === 'lg' ? 16 : 12;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? PRESSED_BG[variant] : BG[variant],
          height,
          borderRadius: radius,
          opacity: disabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        size !== 'sm' && styles.shadow,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <Text style={[styles.label, { fontSize }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  label: {
    color: colors.white,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  shadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
});
