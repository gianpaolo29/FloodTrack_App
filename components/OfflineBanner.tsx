/**
 * Offline banner — shows when device has no network connectivity
 * Also displays sync status when coming back online
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

export function OfflineBanner({
  isOnline,
  syncing,
  pendingCount = 0,
}: {
  isOnline: boolean;
  syncing: boolean;
  pendingCount?: number;
}) {
  if (isOnline && !syncing) return null;

  return (
    <View style={[s.banner, syncing ? s.syncBanner : s.offlineBanner]}>
      <View style={s.iconWrap}>
        {syncing ? (
          <SpinningSyncIcon />
        ) : (
          <PulsingOfflineIcon />
        )}
      </View>
      <Text style={s.text}>
        {syncing
          ? 'Syncing queued updates...'
          : pendingCount > 0
          ? `Offline — ${pendingCount} update${pendingCount !== 1 ? 's' : ''} queued`
          : 'No internet connection'}
      </Text>
      {!syncing && pendingCount > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{pendingCount}</Text>
        </View>
      )}
    </View>
  );
}

/* ── Spinning sync icon ── */
function SpinningSyncIcon() {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="sync" size={14} color={colors.white} />
    </Animated.View>
  );
}

/* ── Pulsing offline icon ── */
function PulsingOfflineIcon() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={s.pulseContainer}>
      <Animated.View
        style={[
          s.pulseRing,
          { transform: [{ scale }], opacity },
        ]}
      />
      <Ionicons name="cloud-offline" size={14} color={colors.white} />
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  offlineBanner: {
    backgroundColor: '#374151',
    borderTopWidth: 1,
    borderTopColor: '#4B5563',
  },
  syncBanner: {
    backgroundColor: colors.brand[500],
    borderTopWidth: 1,
    borderTopColor: colors.brand[300],
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.3,
  },
  iconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* pulse ring behind offline icon */
  pulseContainer: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.severity.critical,
  },
  /* pending count badge */
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.severity.critical,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
});
