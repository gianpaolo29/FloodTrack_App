/**
 * Field Report — structured incident action log
 * Hazard-specific checklists · damage assessment · resource tracking
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getFieldReport, saveFieldReport, getIncidentDetail } from '@/services/api';
import type { FieldReportData } from '@/types';

// ─── Hazard-specific checklists ──────────────────────────────────────────────

const CHECKLISTS: Record<string, string[]> = {
  Flood: [
    'Assessed water level and flow',
    'Checked for trapped residents',
    'Identified evacuation routes',
    'Deployed sandbags / barriers',
    'Coordinated with rescue boats',
    'Documented damage to structures',
  ],
  'Road damage': [
    'Assessed road condition',
    'Set up warning signs / barricades',
    'Diverted traffic',
    'Documented damage extent',
    'Reported to public works',
  ],
  Debris: [
    'Assessed debris type and volume',
    'Checked for hazardous materials',
    'Cleared critical pathways',
    'Coordinated heavy equipment',
    'Documented before/after state',
  ],
  Drainage: [
    'Inspected drainage system',
    'Identified blockage points',
    'Cleared accessible blockages',
    'Reported infrastructure damage',
    'Set up temporary drainage',
  ],
  Other: [
    'Assessed situation',
    'Secured the area',
    'Documented conditions',
    'Coordinated with other agencies',
    'Provided initial assistance',
  ],
};

// ─── Card accent colors ─────────────────────────────────────────────────────

const CARD_ACCENTS = {
  checklist: colors.accent[500],
  actions: colors.brand[500],
  resources: '#F59E0B',
  people: colors.severity.low,
  damage: colors.severity.critical,
};

// ─── Circular progress ring (SVG-free) ──────────────────────────────────────

function ProgressRing({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: colors.slate[200],
        }}
      />
      {/* Fill — we approximate using four quarter arcs via borderColor */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: colors.accent[500],
          borderTopColor: progress >= 0.25 ? colors.accent[500] : 'transparent',
          borderRightColor: progress >= 0.5 ? colors.accent[500] : 'transparent',
          borderBottomColor: progress >= 0.75 ? colors.accent[500] : 'transparent',
          borderLeftColor: progress >= 1 ? colors.accent[500] : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }}
      />
      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.accent[500] }}>
        {Math.round(progress * 100)}%
      </Text>
    </View>
  );
}

// ─── Animated checkbox item ─────────────────────────────────────────────────

function ChecklistRow({
  item,
  checked,
  onToggle,
  isLast,
  isDark,
}: {
  item: string;
  checked: boolean;
  onToggle: () => void;
  isLast: boolean;
  isDark: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: checked ? 1 : 0,
      useNativeDriver: true,
      friction: 5,
      tension: 200,
    }).start();
  }, [checked]);

  return (
    <Pressable
      onPress={onToggle}
      style={[
        s.checkRow,
        isLast && { borderBottomWidth: 0 },
        checked && {
          backgroundColor: isDark ? 'rgba(47,158,91,0.08)' : 'rgba(46,158,91,0.06)',
          borderRadius: 10,
          marginHorizontal: -6,
          paddingHorizontal: 6,
        },
      ]}
    >
      <View
        style={[
          s.checkBox,
          checked && { backgroundColor: colors.accent[500], borderColor: colors.accent[500] },
          isDark && !checked && { borderColor: colors.dark.border },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {checked && <Ionicons name="checkmark" size={14} color={colors.white} />}
        </Animated.View>
      </View>
      <Text
        style={[
          s.checkLabel,
          isDark && { color: colors.slate[300] },
          checked && { textDecorationLine: 'line-through', color: colors.slate[400] },
        ]}
      >
        {item}
      </Text>
    </Pressable>
  );
}

// ─── Focusable TextInput wrapper ────────────────────────────────────────────

function FocusableInput({
  isDark,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { isDark: boolean }) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      style={[
        style,
        focused && { borderColor: colors.accent[500] },
      ]}
    />
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function FieldReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hazardType, setHazardType] = useState('Other');

  const [actionsTaken, setActionsTaken] = useState('');
  const [resourcesUsed, setResourcesUsed] = useState('');
  const [peopleAssisted, setPeopleAssisted] = useState('0');
  const [damageAssessment, setDamageAssessment] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const progressAnim = useRef(new Animated.Value(0)).current;

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg = isDark ? colors.dark.card : colors.white;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Load incident detail to get hazard type
      const incident = await getIncidentDetail(id, token!);
      setHazardType(incident.type || 'Other');

      // Initialize checklist from hazard type
      const items = CHECKLISTS[incident.type] ?? CHECKLISTS['Other'];
      const defaultChecklist: Record<string, boolean> = {};
      items.forEach(item => { defaultChecklist[item] = false; });

      // Load existing field report if any
      const existing = await getFieldReport(id, token!);
      if (existing) {
        setActionsTaken(existing.actionsTaken);
        setResourcesUsed(existing.resourcesUsed);
        setPeopleAssisted(String(existing.peopleAssisted));
        setDamageAssessment(existing.damageAssessment);
        setChecklist({ ...defaultChecklist, ...existing.checklist });
      } else {
        setChecklist(defaultChecklist);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  // Animate progress bar whenever checklist changes
  const checklistItems = CHECKLISTS[hazardType] ?? CHECKLISTS['Other'];
  const completedCount = Object.values(checklist).filter(Boolean).length;
  const progressRatio = checklistItems.length > 0 ? completedCount / checklistItems.length : 0;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: progressRatio,
      useNativeDriver: false,
      friction: 8,
      tension: 60,
    }).start();
  }, [progressRatio]);

  async function handleSave() {
    if (!actionsTaken.trim()) {
      Alert.alert('Required', 'Please describe the actions taken.');
      return;
    }
    setSaving(true);
    try {
      await saveFieldReport(id, {
        actionsTaken: actionsTaken.trim(),
        resourcesUsed: resourcesUsed.trim(),
        peopleAssisted: parseInt(peopleAssisted) || 0,
        damageAssessment: damageAssessment.trim(),
        checklist,
      }, token!);
      Alert.alert('Saved', 'Field report has been saved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save field report.');
    } finally {
      setSaving(false);
    }
  }

  function toggleCheck(item: string) {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
  }

  function incrementPeople() {
    setPeopleAssisted(prev => String((parseInt(prev) || 0) + 1));
  }

  function decrementPeople() {
    setPeopleAssisted(prev => String(Math.max(0, (parseInt(prev) || 0) - 1)));
  }

  if (loading) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: screenBg }]}>
        <ActivityIndicator size="large" color={colors.accent[500]} />
      </View>
    );
  }

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>
      {/* ── Curved Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            s.headerBg,
            { backgroundColor: isDark ? colors.dark.surface : colors.accent[700] },
          ]}
        />
        <View style={s.headerContent}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Field Report</Text>
            <Text style={s.headerSub}>{hazardType} incident</Text>
          </View>
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={s.progressBarContainer}>
        <View style={[s.progressBarTrack, isDark && { backgroundColor: colors.dark.border }]}>
          <Animated.View
            style={[
              s.progressBarFill,
              { width: progressBarWidth },
            ]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* ── Checklist card ── */}
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccentBar, { backgroundColor: CARD_ACCENTS.checklist }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: colors.accent[500] + '18' }]}>
                <Ionicons name="checkbox-outline" size={16} color={colors.accent[500]} />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>Response checklist</Text>
              <ProgressRing progress={progressRatio} />
            </View>

            {checklistItems.map((item, idx) => (
              <ChecklistRow
                key={item}
                item={item}
                checked={!!checklist[item]}
                onToggle={() => toggleCheck(item)}
                isLast={idx === checklistItems.length - 1}
                isDark={isDark}
              />
            ))}
          </View>
        </View>

        {/* ── Actions taken ── */}
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccentBar, { backgroundColor: CARD_ACCENTS.actions }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                <Ionicons name="create-outline" size={16} color={colors.brand[500]} />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>Actions taken *</Text>
            </View>
            <FocusableInput
              isDark={isDark}
              style={[s.textArea, isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white }]}
              placeholder="Describe what actions were taken to resolve the incident..."
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline numberOfLines={4} textAlignVertical="top"
              value={actionsTaken} onChangeText={setActionsTaken}
            />
          </View>
        </View>

        {/* ── Resources used ── */}
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccentBar, { backgroundColor: CARD_ACCENTS.resources }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: '#F59E0B18' }]}>
                <Ionicons name="construct-outline" size={16} color="#F59E0B" />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>Resources used</Text>
            </View>
            <FocusableInput
              isDark={isDark}
              style={[s.textArea, isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white }]}
              placeholder="Equipment, vehicles, supplies deployed..."
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline numberOfLines={3} textAlignVertical="top"
              value={resourcesUsed} onChangeText={setResourcesUsed}
            />
          </View>
        </View>

        {/* ── People assisted ── */}
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccentBar, { backgroundColor: CARD_ACCENTS.people }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: colors.severity.low + '18' }]}>
                <Ionicons name="people-outline" size={16} color={colors.severity.low} />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>People assisted</Text>
            </View>
            <View style={s.peopleRow}>
              <Pressable
                onPress={decrementPeople}
                style={[
                  s.circleBtn,
                  isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                ]}
              >
                <Ionicons name="remove" size={20} color={isDark ? colors.white : colors.slate[700]} />
              </Pressable>
              <Text style={[s.peopleCount, isDark && { color: colors.white }]}>
                {parseInt(peopleAssisted) || 0}
              </Text>
              <Pressable
                onPress={incrementPeople}
                style={[s.circleBtn, s.circleBtnAccent]}
              >
                <Ionicons name="add" size={20} color={colors.white} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Damage assessment ── */}
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccentBar, { backgroundColor: CARD_ACCENTS.damage }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: colors.severity.critical + '18' }]}>
                <Ionicons name="warning-outline" size={16} color={colors.severity.critical} />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>Damage assessment</Text>
            </View>
            <FocusableInput
              isDark={isDark}
              style={[s.textArea, isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white }]}
              placeholder="Describe the extent of damage observed..."
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline numberOfLines={3} textAlignVertical="top"
              value={damageAssessment} onChangeText={setDamageAssessment}
            />
          </View>
        </View>
      </ScrollView>

      {/* ── Save button ── */}
      <View
        style={[
          s.bottomBar,
          {
            paddingBottom: insets.bottom + 14,
            backgroundColor: isDark ? colors.dark.surface : colors.white,
          },
        ]}
      >
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            s.saveBtn,
            saving && { opacity: 0.6 },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          {/* Top highlight strip for gradient-like visual */}
          <View style={s.saveBtnHighlight} />
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color={colors.white} />
              <Text style={s.saveBtnText}>Save Field Report</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  // ── Curved header ──
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
    paddingBottom: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // ── Progress bar ──
  progressBarContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate[200],
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent[500],
  },

  // ── Scroll ──
  scroll: { padding: 16, gap: 14 },

  // ── Cards ──
  card: {
    borderRadius: 18,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardAccentBar: {
    width: 4,
  },
  cardInner: {
    flex: 1,
    padding: 18,
    gap: 14,
  },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate[900] },

  // ── Checklist ──
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.slate[100],
  },
  checkBox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2,
    borderColor: colors.slate[300], alignItems: 'center', justifyContent: 'center',
  },
  checkLabel: { flex: 1, fontSize: 14, color: colors.slate[700] },

  // ── Inputs ──
  textArea: {
    borderWidth: 1.5, borderColor: colors.slate[200], borderRadius: 18,
    padding: 14, fontSize: 14, color: colors.slate[900], minHeight: 80,
    backgroundColor: colors.slate[50],
  },

  // ── People assisted ──
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 4,
  },
  circleBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center', justifyContent: 'center',
  },
  circleBtnAccent: {
    backgroundColor: colors.accent[500],
    borderColor: colors.accent[500],
  },
  peopleCount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.slate[900],
    minWidth: 48,
    textAlign: 'center',
  },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: colors.slate[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent[500], borderRadius: 18,
    paddingVertical: 16,
    overflow: 'hidden',
    shadowColor: colors.accent[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '50%' as any,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
