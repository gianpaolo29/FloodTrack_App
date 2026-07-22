import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getProtocols } from '@/services/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Protocol {
  id: string;
  hazard: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  safetyTip: string;
  steps: string[];
}

const FALLBACK_PROTOCOLS: Protocol[] = [
  {
    id: 'flood',
    hazard: 'Flood Response',
    icon: 'water',
    color: '#3B82F6',
    safetyTip: 'Never enter floodwater above knee level. Watch for debris and fast currents.',
    steps: [
      'Assess water level, depth, and flow direction from a safe vantage point',
      'Identify trapped or stranded residents — prioritize elderly, children, PWDs',
      'Establish evacuation routes away from rising water levels',
      'Deploy sandbags or barriers to protect critical infrastructure',
      'Coordinate with rescue boats if water depth exceeds safe wading level',
      'Set up temporary shelter and distribute emergency supplies',
      'Document water marks on structures for damage assessment',
      'Monitor weather updates for additional rainfall warnings',
      'Ensure electrical mains are disconnected in flooded areas',
      'Report structural damage to buildings coordination center',
    ],
  },
];

const TRAINING_RESOURCES = [
  { label: 'NDRRMC Incident Command System (ICS) Manual', icon: 'document-text-outline' as const },
  { label: 'Basic Life Support & First Aid Guidelines', icon: 'heart-outline' as const },
  { label: 'Flood Rescue Operations Standard Procedures', icon: 'boat-outline' as const },
  { label: 'Radio Communication Protocols', icon: 'radio-outline' as const },
];

function ProtocolCard({
  proto,
  isOpen,
  onToggle,
  isDark,
  cardBg,
}: {
  proto: Protocol;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  cardBg: string;
}) {
  const chevronAnim = useRef(new Animated.Value(isOpen ? 1 : 0)).current;

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(chevronAnim, {
      toValue: isOpen ? 0 : 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
    onToggle();
  };

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={[s.card, { backgroundColor: cardBg }]}>
      <View style={[s.cardAccent, { backgroundColor: proto.color }]} />

      <View style={s.cardInner}>
        <Pressable
          onPress={handleToggle}
          style={({ pressed }) => [
            s.cardHeader,
            pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={[s.cardIcon, { backgroundColor: proto.color + '18' }]}>
            <Ionicons name={proto.icon} size={18} color={proto.color} />
          </View>
          <View style={s.cardTitleWrap}>
            <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
              {proto.hazard}
            </Text>
            <View style={[s.stepBadge, { backgroundColor: proto.color + '14' }]}>
              <Ionicons name="list-outline" size={10} color={proto.color} />
              <Text style={[s.stepBadgeText, { color: proto.color }]}>
                {proto.steps.length} steps
              </Text>
            </View>
          </View>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <Ionicons name="chevron-down" size={18} color={colors.slate[400]} />
          </Animated.View>
        </Pressable>

        {isOpen && (
          <View style={s.cardContent}>
            <View
              style={[
                s.safetyTip,
                isDark && {
                  backgroundColor: colors.severity.critical + '10',
                  borderColor: colors.severity.critical + '30',
                },
              ]}
            >
              <View style={[s.safetyIconCircle, { backgroundColor: colors.severity.critical + '18' }]}>
                <Ionicons name="warning" size={18} color={colors.severity.critical} />
              </View>
              <View style={s.safetyTextWrap}>
                <Text style={s.safetyLabel}>Safety Reminder</Text>
                <Text style={[s.safetyTipText, isDark && { color: colors.severity.critical }]}>
                  {proto.safetyTip}
                </Text>
              </View>
            </View>

            <View style={s.stepsContainer}>
              {proto.steps.map((step, idx) => (
                <View key={idx} style={s.stepWrapper}>
                  {idx < proto.steps.length - 1 && (
                    <View
                      style={[
                        s.progressLine,
                        { backgroundColor: proto.color + '4D' },
                      ]}
                    />
                  )}
                  <View style={s.stepRow}>
                    <View style={[s.stepNum, { backgroundColor: proto.color + '18' }]}>
                      <Text style={[s.stepNumText, { color: proto.color }]}>{idx + 1}</Text>
                    </View>
                    <Text style={[s.stepText, isDark && { color: colors.slate[300] }]}>
                      {step}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export default function ProtocolsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>(FALLBACK_PROTOCOLS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getProtocols(token!);
      setProtocols(
        data.map((item) => ({
          ...item,
          icon: item.icon as keyof typeof Ionicons.glyphMap,
        }))
      );
    } catch {
      setProtocols(FALLBACK_PROTOCOLS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg = isDark ? colors.dark.card : colors.white;

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: screenBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.brand[700]} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            s.headerBg,
            { backgroundColor: isDark ? colors.dark.surface : colors.brand[700] },
          ]}
        />
        <View style={s.headerContent}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              s.backBtn,
              pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
            ]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Response Protocols</Text>
            <Text style={s.headerSub}>Standard operating procedures by hazard type</Text>
          </View>
          <View style={s.headerBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.white} />
            <Text style={s.headerBadgeText}>{protocols.length}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[700]} />
        }
      >
        {protocols.map((proto) => (
          <ProtocolCard
            key={proto.id}
            proto={proto}
            isOpen={expanded === proto.id}
            onToggle={() => setExpanded(expanded === proto.id ? null : proto.id)}
            isDark={isDark}
            cardBg={cardBg}
          />
        ))}

        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccent, { backgroundColor: colors.brand[500] }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                <Ionicons name="book-outline" size={18} color={colors.brand[500]} />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
                Training Resources
              </Text>
            </View>
            <View style={s.cardContent}>
              {TRAINING_RESOURCES.map((item, idx) => (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    s.trainingItem,
                    { backgroundColor: isDark ? colors.dark.elevated : colors.brand[500] + '08' },
                    pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <View style={[s.trainingIconBg, { backgroundColor: colors.brand[500] + '14' }]}>
                    <Ionicons name={item.icon} size={16} color={colors.brand[500]} />
                  </View>
                  <Text style={[s.trainingText, isDark && { color: colors.slate[300] }]}>
                    {item.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.slate[400]} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: { position: 'relative', zIndex: 10 },
  headerBg: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '700', color: colors.white },

  scroll: { padding: 16, gap: 14 },

  card: {
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardAccent: {
    width: 4,
  },
  cardInner: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: {
    flex: 1,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  stepBadgeText: { fontSize: 10, fontWeight: '700' },
  cardContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },

  safetyTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: colors.severity.critical + '08',
    borderColor: colors.severity.critical + '25',
  },
  safetyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  safetyTextWrap: { flex: 1, gap: 2 },
  safetyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.severity.critical,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  safetyTipText: {
    fontSize: 13,
    color: colors.severity.critical,
    lineHeight: 19,
    fontWeight: '500',
  },

  stepsContainer: { gap: 0 },
  stepWrapper: { position: 'relative' },
  progressLine: {
    position: 'absolute',
    left: 12,
    top: 28,
    width: 2,
    bottom: 0,
    borderRadius: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 13, color: colors.slate[600], lineHeight: 20, paddingTop: 3 },

  trainingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  trainingIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainingText: { flex: 1, fontSize: 13, color: colors.slate[700], lineHeight: 18, fontWeight: '500' },
});
