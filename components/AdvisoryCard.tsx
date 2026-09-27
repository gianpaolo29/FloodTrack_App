import React from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import type { ReportDetail } from '@/types';

type Advisory = NonNullable<ReportDetail['advisory']>;

interface Props {
  advisory: Advisory;
  isDark: boolean;
}

const TEAL = '#0F766E';
const TEAL_BG = '#CCFBF1';
const TEAL_LIGHT = '#F0FDFA';

function openDirections(lat: number, lng: number, name: string) {
  const label = encodeURIComponent(name);
  const url = Platform.select({
    ios: `maps:0,0?q=${label}@${lat},${lng}`,
    default: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
  })!;
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
}

export function AdvisoryCard({ advisory, isDark }: Props) {
  const cardBg = isDark ? colors.dark.card : '#fff';
  const borderColor = isDark ? colors.dark.border : '#E0E0E0';
  const textPrimary = isDark ? colors.white : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[600];

  return (
    <View style={[$.card, { backgroundColor: cardBg, borderColor }]}>
      {/* Header */}
      <View style={$.header}>
        <View style={$.headerIcon}>
          <Ionicons name="shield-checkmark" size={16} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[$.headerTitle, { color: textPrimary }]}>Safety Advisory</Text>
          <Text style={[$.headerSub, { color: textSecondary }]}>
            AI-generated guidance based on your report
          </Text>
        </View>
      </View>

      {/* Nearby Evacuation Centers */}
      {advisory.nearby_centers.length > 0 && (
        <View style={$.section}>
          <View style={$.sectionLabelRow}>
            <Ionicons name="location" size={14} color={TEAL} />
            <Text style={[$.sectionTitle, { color: textPrimary }]}>Nearby Evacuation Centers</Text>
          </View>
          {advisory.nearby_centers.map((center) => (
            <View key={center.id} style={[$.centerRow, { backgroundColor: isDark ? colors.dark.border : TEAL_LIGHT }]}>
              <View style={{ flex: 1 }}>
                <Text style={[$.centerName, { color: textPrimary }]}>{center.name}</Text>
                <Text style={[$.centerAddr, { color: textSecondary }]}>{center.address}</Text>
                <View style={$.centerMeta}>
                  <View style={$.distancePill}>
                    <Ionicons name="navigate-outline" size={10} color={TEAL} />
                    <Text style={$.distanceText}>{center.distance_km} km</Text>
                  </View>
                  <Text style={[$.capacityText, center.occupancy_pct >= 90 && { color: '#DC2626' }, { color: textSecondary }]}>
                    {center.occupancy_pct}% occupied ({center.current_occupancy}/{center.capacity})
                  </Text>
                </View>
                {/* Capacity bar */}
                <View style={$.capacityBar}>
                  <View
                    style={[
                      $.capacityFill,
                      {
                        width: `${Math.min(center.occupancy_pct, 100)}%`,
                        backgroundColor: center.occupancy_pct >= 90 ? '#DC2626' : center.occupancy_pct >= 70 ? '#F59E0B' : TEAL,
                      },
                    ]}
                  />
                </View>
              </View>
              {center.latitude && center.longitude && (
                <TouchableOpacity
                  style={$.directionsBtn}
                  onPress={() => openDirections(center.latitude, center.longitude, center.name)}
                  accessibilityLabel={`Get directions to ${center.name}`}
                >
                  <Ionicons name="navigate" size={16} color={TEAL} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Suggested Actions */}
      {advisory.suggested_actions.length > 0 && (
        <View style={$.section}>
          <View style={$.sectionLabelRow}>
            <Ionicons name="bulb" size={14} color={TEAL} />
            <Text style={[$.sectionTitle, { color: textPrimary }]}>What You Should Do</Text>
          </View>
          {advisory.suggested_actions.map((action, i) => (
            <View key={i} style={$.actionRow}>
              <View style={$.actionBullet}>
                <Ionicons name="checkmark-circle" size={16} color={TEAL} />
              </View>
              <Text style={[$.actionText, { color: textPrimary }]}>{action}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Safety Tips */}
      {advisory.safety_tips.length > 0 && advisory.safety_tips.map((tip, i) => (
        <View key={i} style={$.section}>
          <View style={$.sectionLabelRow}>
            <Ionicons name="warning" size={14} color={TEAL} />
            <Text style={[$.sectionTitle, { color: textPrimary }]}>Safety Tips</Text>
          </View>
          {tip.tip ? <Text style={[$.tipText, { color: textSecondary }]}>{tip.tip}</Text> : null}
          {tip.steps.length > 0 && tip.steps.map((step, j) => (
            <View key={j} style={$.stepRow}>
              <View style={$.stepNumber}>
                <Text style={$.stepNumberText}>{j + 1}</Text>
              </View>
              <Text style={[$.stepText, { color: textPrimary }]}>{step}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const $ = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Evacuation centers
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    gap: 10,
  },
  centerName: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerAddr: {
    fontSize: 11,
    marginTop: 2,
  },
  centerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: TEAL_BG,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '700',
    color: TEAL,
  },
  capacityText: {
    fontSize: 10,
    fontWeight: '500',
  },
  capacityBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginTop: 6,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 2,
  },
  directionsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: TEAL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  actionBullet: {
    marginTop: 1,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  // Safety tips
  tipText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 5,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: TEAL_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 10,
    fontWeight: '800',
    color: TEAL,
  },
  stepText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});
