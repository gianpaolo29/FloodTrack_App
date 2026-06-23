/**
 * AppAlert — premium SweetAlert-style animated modal
 *
 * Types: success · error · warning · info · confirm
 * Features: spring animation, dark-mode aware, icon glow, action buttons
 */
import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AlertConfig {
  type: AlertType;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

// ─── Alert type metadata ──────────────────────────────────────────────────────

const ALERT_META: Record<AlertType, {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  lightBg: string;
  darkBg: string;
}> = {
  success: {
    icon:    'checkmark-circle',
    color:   '#2E9E5B',
    lightBg: '#E7F6EC',
    darkBg:  '#0E2A1A',
  },
  error: {
    icon:    'close-circle',
    color:   '#D32F2F',
    lightBg: '#FDECEA',
    darkBg:  '#2A0E0E',
  },
  warning: {
    icon:    'warning',
    color:   '#F4B400',
    lightBg: '#FFF8E1',
    darkBg:  '#2A2208',
  },
  info: {
    icon:    'information-circle',
    color:   colors.brand[500],
    lightBg: colors.brand[50],
    darkBg:  '#081A30',
  },
  confirm: {
    icon:    'help-circle',
    color:   '#EA6A0C',
    lightBg: '#FFF3E0',
    darkBg:  '#2A1608',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  config: AlertConfig;
  onDismiss: () => void;
}

export function AppAlert({ config, onDismiss }: Props) {
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const meta    = ALERT_META[config.type];

  // ── Animation ──
  const scaleAnim   = useRef(new Animated.Value(0.78)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const backdropOp  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
        mass: 0.8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function animateDismiss(callback?: () => void) {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.85,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOp, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
      callback?.();
    });
  }

  // ── Colors ──
  const cardBg      = isDark ? colors.dark.elevated : colors.white;
  const titleColor  = isDark ? colors.dark.text      : '#0A0D14';
  const msgColor    = isDark ? colors.dark.subtext    : colors.slate[500];
  const iconBg      = isDark ? meta.darkBg            : meta.lightBg;
  const borderColor = isDark ? colors.dark.border     : 'transparent';
  const isDestructive = config.type === 'confirm' || config.type === 'error';
  const confirmBtnColor = isDestructive ? meta.color : colors.brand[500];

  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={() => animateDismiss(config.onCancel)}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: backdropOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => animateDismiss(config.onCancel)} />
      </Animated.View>

      {/* Card wrapper (centered, not a Pressable so touches don't bleed to backdrop) */}
      <View style={s.centerer} pointerEvents="box-none">
        <Animated.View
          style={[
            s.card,
            {
              backgroundColor: cardBg,
              borderColor,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Top accent stripe */}
          <View style={[s.stripe, { backgroundColor: meta.color }]} />

          {/* Icon circle */}
          <View style={[s.iconRing, { backgroundColor: iconBg, shadowColor: meta.color }]}>
            <Ionicons name={meta.icon} size={44} color={meta.color} />
          </View>

          {/* Title */}
          <Text style={[s.title, { color: titleColor }]}>{config.title}</Text>

          {/* Message */}
          {config.message ? (
            <Text style={[s.message, { color: msgColor }]}>{config.message}</Text>
          ) : null}

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: isDark ? colors.dark.border : colors.slate[100] }]} />

          {/* Buttons */}
          <View style={[s.btnRow, config.cancelText && s.btnRowDouble]}>
            {config.cancelText && (
              <Pressable
                onPress={() => animateDismiss(config.onCancel)}
                style={({ pressed }) => [
                  s.btnCancel,
                  { borderColor: isDark ? colors.dark.border : colors.slate[200] },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={config.cancelText}
              >
                <Text style={[s.btnCancelText, { color: isDark ? colors.slate[400] : colors.slate[600] }]}>
                  {config.cancelText}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => animateDismiss(config.onConfirm)}
              style={({ pressed }) => [
                s.btnConfirm,
                { backgroundColor: confirmBtnColor },
                !config.cancelText && s.btnConfirmFull,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={config.confirmText ?? 'OK'}
            >
              <Text style={s.btnConfirmText}>{config.confirmText ?? 'OK'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 7, 14, 0.72)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 48,
    elevation: 24,
  },
  stripe: {
    height: 5,
    width: '100%',
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    paddingHorizontal: 24,
    lineHeight: 28,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
    paddingHorizontal: 28,
    paddingBottom: 4,
  },
  divider: {
    height: 1,
    width: '100%',
    marginTop: 20,
  },
  btnRow: {
    width: '100%',
    padding: 20,
    gap: 10,
  },
  btnRowDouble: {
    flexDirection: 'row',
  },
  btnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnConfirm: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  btnConfirmFull: {
    flex: undefined,
    alignSelf: 'stretch',
  },
  btnConfirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
