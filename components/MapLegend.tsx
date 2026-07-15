import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';

/* ───────────────────── types ───────────────────── */

export type HazardCategory = 'flood' | 'road';

interface HazardItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
}

interface Props {
  isDark: boolean;
  visible: boolean;
  onClose: () => void;
  topOffset: number;
  visibleCategories: HazardCategory[];
  onToggleCategory: (category: HazardCategory) => void;
  counts?: Record<string, number>;
}

/* ───────────────────── hazard definitions ───────────────────── */

const FLOOD_HAZARDS: HazardItem[] = [
  { key: 'flashFlood',   label: 'Flash Flood',           icon: 'thunderstorm', color: colors.floodHazard.flashFlood,   description: 'Sudden, fast-moving flood from heavy rain' },
  { key: 'riverFlood',   label: 'River Overflow',        icon: 'water',        color: colors.floodHazard.riverFlood,   description: 'River or creek exceeding its banks' },
  { key: 'coastalFlood', label: 'Coastal / Storm Surge', icon: 'boat',         color: colors.floodHazard.coastalFlood, description: 'Seawater intrusion from storm surge or high tide' },
  { key: 'urbanFlood',   label: 'Urban Flood',           icon: 'business',     color: colors.floodHazard.urbanFlood,   description: 'Drainage overflow in built-up areas' },
];

const ROAD_HAZARDS: HazardItem[] = [
  { key: 'closedRoad',  label: 'Road Closed',         icon: 'close-circle', color: colors.roadHazard.closedRoad,  description: 'Road fully closed to traffic' },
  { key: 'debris',      label: 'Debris / Obstruction', icon: 'warning',      color: colors.roadHazard.debris,      description: 'Fallen trees, rocks, or debris blocking road' },
  { key: 'landslide',   label: 'Landslide',           icon: 'earth',        color: colors.roadHazard.landslide,   description: 'Soil or rock collapse along the road' },
  { key: 'impassable',  label: 'Flooded Road',        icon: 'car',          color: colors.roadHazard.impassable,  description: 'Road submerged — not safe for vehicles' },
  { key: 'slowDown',    label: 'Slow Down Zone',      icon: 'speedometer',  color: colors.roadHazard.slowDown,    description: 'Partially passable — reduce speed' },
];

const CATEGORIES: {
  key: HazardCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  gradient: [string, string];
  items: HazardItem[];
}[] = [
  {
    key: 'flood',
    label: 'Flood Hazards',
    icon: 'water',
    color: colors.brand[500],
    gradient: [colors.brand[500], '#0277BD'],
    items: FLOOD_HAZARDS,
  },
  {
    key: 'road',
    label: 'Road Hazards',
    icon: 'car',
    color: colors.roadHazard.closedRoad,
    gradient: [colors.roadHazard.debris, colors.roadHazard.closedRoad],
    items: ROAD_HAZARDS,
  },
];

/* ───────────────────── component ───────────────────── */

export function MapLegend({
  isDark,
  visible,
  onClose,
  topOffset,
  visibleCategories,
  onToggleCategory,
  counts,
}: Props) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  const bg        = isDark ? colors.dark.surface   : colors.white;
  const titleClr  = isDark ? colors.slate[200]     : colors.slate[800];
  const textClr   = isDark ? colors.slate[400]     : colors.slate[500];
  const subtleClr = isDark ? colors.dark.border     : colors.slate[200];
  const cardBg    = isDark ? colors.dark.card       : colors.slate[50];

  return (
    <>
      {/* Backdrop — tapping closes the drawer */}
      {visible && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 55 }]}
          onPress={onClose}
        />
      )}

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          s.drawer,
          {
            top: topOffset,
            backgroundColor: bg,
            opacity: slideAnim,
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            }],
          },
        ]}
      >
        {/* Top accent line */}
        <LinearGradient
          colors={[colors.brand[500], colors.roadHazard.closedRoad]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.accentLine}
        />

        {/* Header */}
        <View style={s.header}>
          <View style={[s.headerIconWrap, { backgroundColor: colors.brand[500] + '15' }]}>
            <Ionicons name="map" size={14} color={colors.brand[500]} />
          </View>
          <Text style={[s.headerTitle, { color: titleClr }]}>Map Legend</Text>
          <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}>
            <Ionicons name="close" size={18} color={textClr} />
          </Pressable>
        </View>

        <ScrollView
          style={s.scrollBody}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {CATEGORIES.map((cat, ci) => {
            const isVisible = visibleCategories.includes(cat.key);
            const categoryCount = cat.items.reduce(
              (sum, item) => sum + (counts?.[item.key] ?? 0),
              0,
            );

            return (
              <View
                key={cat.key}
                style={[
                  s.categoryCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: isVisible ? cat.color + '40' : subtleClr,
                  },
                  ci > 0 && { marginTop: 10 },
                ]}
              >
                {/* Category header with toggle */}
                <Pressable
                  style={s.categoryRow}
                  onPress={() => onToggleCategory(cat.key)}
                  accessibilityLabel={`${isVisible ? 'Hide' : 'Show'} ${cat.label}`}
                >
                  <View style={s.categoryLeft}>
                    <LinearGradient
                      colors={cat.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.catIconGradient}
                    >
                      <Ionicons name={cat.icon} size={13} color="#fff" />
                    </LinearGradient>
                    <View>
                      <Text style={[s.catLabel, { color: titleClr }]}>{cat.label}</Text>
                      <Text style={[s.catSub, { color: textClr }]}>
                        {cat.items.length} types
                        {categoryCount > 0 ? ` · ${categoryCount} active` : ''}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      s.toggle,
                      { backgroundColor: isVisible ? cat.color : subtleClr },
                    ]}
                  >
                    <View
                      style={[
                        s.toggleKnob,
                        isVisible ? s.toggleKnobOn : s.toggleKnobOff,
                      ]}
                    />
                  </View>
                </Pressable>

                {/* Hazard items — only when category is on */}
                {isVisible && (
                  <View style={[s.itemsWrap, { borderTopColor: subtleClr }]}>
                    {cat.items.map((item, ii) => {
                      const itemCount = counts?.[item.key] ?? 0;
                      return (
                        <View
                          key={item.key}
                          style={[
                            s.itemRow,
                            ii > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: subtleClr },
                          ]}
                        >
                          <View style={[s.itemIconWrap, { backgroundColor: item.color + '15' }]}>
                            <Ionicons name={item.icon} size={13} color={item.color} />
                          </View>
                          <View style={s.itemTextWrap}>
                            <Text style={[s.itemLabel, { color: titleClr }]}>{item.label}</Text>
                            <Text style={[s.itemDesc, { color: textClr }]} numberOfLines={1}>
                              {item.description}
                            </Text>
                          </View>
                          {itemCount > 0 && (
                            <View style={[s.itemBadge, { backgroundColor: item.color + '18' }]}>
                              <Text style={[s.itemBadgeText, { color: item.color }]}>{itemCount}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}

          {/* Severity scale */}
          <View style={[s.severityCard, { backgroundColor: cardBg, borderColor: subtleClr }]}>
            <Text style={[s.sevTitle, { color: textClr }]}>Severity Scale</Text>
            <View style={s.sevRow}>
              {([
                { label: 'Low',      color: colors.severity.low },
                { label: 'Moderate', color: colors.severity.moderate },
                { label: 'High',     color: colors.severity.high },
                { label: 'Critical', color: colors.severity.critical },
              ] as const).map(sev => (
                <View key={sev.label} style={s.sevItem}>
                  <View style={[s.sevDot, { backgroundColor: sev.color }]} />
                  <Text style={[s.sevLabel, { color: titleClr }]}>{sev.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

/* ───────────────────── styles ───────────────────── */

const s = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 56,
    maxHeight: 420,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  accentLine: {
    height: 2.5,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* scroll body */
  scrollBody: {
    maxHeight: 350,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },

  /* category card */
  categoryCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  catIconGradient: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  catSub: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },

  /* toggle */
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  toggleKnobOn:  { alignSelf: 'flex-end' },
  toggleKnobOff: { alignSelf: 'flex-start' },

  /* hazard items */
  itemsWrap: {
    borderTopWidth: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  itemIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextWrap: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemDesc: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  itemBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  itemBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },

  /* severity */
  severityCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  sevTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sevRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sevItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sevDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sevLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
});
