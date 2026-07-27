import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
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
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getFieldReport, saveFieldReport, getIncidentDetail } from '@/services/api';
import type { FieldReportData } from '@/types';

// ─── Checklist definitions ────────────────────────────────────────────────────
const CHECKLISTS: Record<string, string[]> = {
  Flood: [
    'Assessed water level and flow',
    'Checked for trapped residents',
    'Identified evacuation routes',
    'Deployed sandbags / barriers',
    'Coordinated with rescue boats',
    'Documented damage to structures',
  ],
};

const HEADER_GRADIENT = ['#1F6FBF', '#124577', '#0B2F52'] as const;

const CARD_ACCENTS = {
  checklist: colors.brand[500],
  actions:   colors.brand[500],
  resources: '#F59E0B',
  people:    colors.severity.low,
  damage:    colors.severity.critical,
};

// ─── Sweet Alert ─────────────────────────────────────────────────────────────
type SweetAlertState = { type: 'success' | 'warning' | 'error'; title: string; message: string; onConfirm?: () => void } | null;

const SA_META = {
  success: { icon: 'checkmark-circle' as const, color: '#10B981', bg: '#D1FAE5' },
  warning: { icon: 'warning'           as const, color: '#F59E0B', bg: '#FEF3C7' },
  error:   { icon: 'close-circle'      as const, color: '#EF4444', bg: '#FEE2E2' },
};

function SweetAlertModal({ alert: cfg, onDismiss, isDark }: { alert: NonNullable<SweetAlertState>; onDismiss: () => void; isDark: boolean }) {
  const meta   = SA_META[cfg.type];
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={saS.backdrop}>
        <View style={[saS.card, { backgroundColor: cardBg }]}>
          <View style={[saS.iconCircle, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={44} color={meta.color} />
          </View>
          <Text style={[saS.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{cfg.title}</Text>
          <Text style={[saS.message, { color: isDark ? '#94A3B8' : '#64748B' }]}>{cfg.message}</Text>
          <View style={saS.btnRow}>
            {cfg.onConfirm && (
              <Pressable
                style={({ pressed }) => [saS.btn, { backgroundColor: isDark ? '#334155' : '#F1F5F9', flex: 1 }, pressed && { opacity: 0.8 }]}
                onPress={onDismiss}
              >
                <Text style={[saS.btnText, { color: isDark ? '#CBD5E1' : '#475569' }]}>Cancel</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [saS.btn, { backgroundColor: meta.color, flex: 1 }, pressed && { opacity: 0.82 }]}
              onPress={() => { onDismiss(); cfg.onConfirm?.(); }}
            >
              <Text style={[saS.btnText, { color: '#fff' }]}>{cfg.onConfirm ? 'OK' : 'Got it'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const saS = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:       { width: '100%', borderRadius: 24, alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24, gap: 8,
                shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:      { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message:    { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 2, marginBottom: 8 },
  btnRow:     { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
  btn:        { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:    { fontSize: 15, fontWeight: '700' },
});

// ─── ChecklistRow ─────────────────────────────────────────────────────────────
function ChecklistRow({
  item, checked, onToggle, isLast, isDark,
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
          backgroundColor: isDark ? 'rgba(31,111,191,0.08)' : 'rgba(31,111,191,0.05)',
          borderRadius: 10,
          marginHorizontal: -6,
          paddingHorizontal: 6,
        },
      ]}
    >
      <View style={[
        s.checkBox,
        checked && { backgroundColor: colors.brand[500], borderColor: colors.brand[500] },
        isDark && !checked && { borderColor: colors.dark.border },
      ]}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {checked && <Ionicons name="checkmark" size={14} color={colors.white} />}
        </Animated.View>
      </View>
      <Text style={[
        s.checkLabel,
        isDark && { color: colors.slate[300] },
        checked && { textDecorationLine: 'line-through', color: isDark ? colors.slate[500] : colors.slate[400] },
      ]}>
        {item}
      </Text>
    </Pressable>
  );
}

// ─── FocusableInput ───────────────────────────────────────────────────────────
function FocusableInput({
  isDark, style, ...props
}: React.ComponentProps<typeof TextInput> & { isDark: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e  => { setFocused(false); props.onBlur?.(e); }}
      style={[style, focused && { borderColor: colors.brand[500] }]}
    />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function FieldReportScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scheme    = useColorScheme();
  const isDark    = scheme === 'dark';
  const { token } = useAuth();

  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [hazardType, setHazardType]       = useState('Flood');
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentRef, setIncidentRef]     = useState('');
  const [isExisting, setIsExisting]       = useState(false);

  const [actionsTaken, setActionsTaken]       = useState('');
  const [resourcesUsed, setResourcesUsed]     = useState('');
  const [peopleAssisted, setPeopleAssisted]   = useState('0');
  const [damageAssessment, setDamageAssessment] = useState('');
  const [checklist, setChecklist]             = useState<Record<string, boolean>>({});
  const [sweetAlert, setSweetAlert]           = useState<SweetAlertState>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg   = isDark ? colors.dark.card : colors.white;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const incident = await getIncidentDetail(id, token);
      const type     = incident.type || 'Flood';
      setHazardType(type);
      setIncidentTitle(incident.title);
      setIncidentRef(incident.reference);

      const items = CHECKLISTS[type] ?? CHECKLISTS['Flood'];
      const defaultChecklist: Record<string, boolean> = {};
      items.forEach(item => { defaultChecklist[item] = false; });

      const existing = await getFieldReport(id, token);
      if (existing) {
        setIsExisting(true);
        setActionsTaken(existing.actionsTaken);
        setResourcesUsed(existing.resourcesUsed);
        setPeopleAssisted(String(existing.peopleAssisted));
        setDamageAssessment(existing.damageAssessment);
        setChecklist({ ...defaultChecklist, ...existing.checklist });
      } else {
        setChecklist(defaultChecklist);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const checklistItems    = CHECKLISTS[hazardType] ?? CHECKLISTS['Flood'];
  const completedCount    = Object.values(checklist).filter(Boolean).length;
  const totalCount        = checklistItems.length;
  const progressRatio     = totalCount > 0 ? completedCount / totalCount : 0;
  const allChecksDone     = completedCount === totalCount;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: progressRatio,
      useNativeDriver: false,
      friction: 8,
      tension: 60,
    }).start();
  }, [progressRatio]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  async function handleSave() {
    if (!actionsTaken.trim()) {
      setSweetAlert({ type: 'warning', title: 'Required Field', message: 'Please describe the actions taken before saving.' });
      return;
    }
    setSaving(true);
    try {
      await saveFieldReport(id, {
        actionsTaken:     actionsTaken.trim(),
        resourcesUsed:    resourcesUsed.trim(),
        peopleAssisted:   parseInt(peopleAssisted) || 0,
        damageAssessment: damageAssessment.trim(),
        checklist,
      }, token!, isExisting);
      setIsExisting(true);
      setSweetAlert({
        type: 'success',
        title: isExisting ? 'Report Updated!' : 'Report Saved!',
        message: 'Field report has been successfully saved.',
        onConfirm: () => router.back(),
      });
    } catch (e: any) {
      setSweetAlert({ type: 'error', title: 'Save Failed', message: e?.message ?? 'Could not save the field report. Please try again.' });
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
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={HEADER_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={s.headerOverlay} />

        {/* Top row: back + title + badge */}
        <View style={s.headerContent}>
          <Pressable
            onPress={() => router.back()}
            style={s.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>

          <View style={{ flex: 1, gap: 2 }}>
            {incidentRef !== '' && (
              <Text style={s.headerRef}>{incidentRef}</Text>
            )}
            <Text style={s.headerTitle}>Field Report</Text>
            {incidentTitle !== '' && (
              <Text style={s.headerSub} numberOfLines={1}>{incidentTitle}</Text>
            )}
          </View>

          {isExisting && (
            <View style={s.savedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={colors.white} />
              <Text style={s.savedBadgeText}>Saved</Text>
            </View>
          )}
        </View>

        {/* Progress strip */}
        <View style={s.progressStrip}>
          <View style={s.progressMeta}>
            <Ionicons
              name={allChecksDone ? 'checkmark-circle' : 'checkbox-outline'}
              size={13}
              color={allChecksDone ? '#4ADE80' : 'rgba(255,255,255,0.75)'}
            />
            <Text style={[s.progressLabel, allChecksDone && { color: '#4ADE80' }]}>
              {completedCount} of {totalCount} tasks
            </Text>
          </View>
          <Text style={s.progressPct}>{Math.round(progressRatio * 100)}%</Text>
        </View>
        <View style={s.progressBarTrack}>
          <Animated.View
            style={[
              s.progressBarFill,
              { width: progressBarWidth },
              allChecksDone && { backgroundColor: '#4ADE80' },
            ]}
          />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Checklist ── */}
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={[s.cardAccentBar, { backgroundColor: CARD_ACCENTS.checklist }]} />
          <View style={s.cardInner}>
            <View style={s.cardHeader}>
              <View style={[s.cardIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                <Ionicons name="checkbox-outline" size={16} color={colors.brand[500]} />
              </View>
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
                Response checklist
              </Text>
              <View style={[
                s.checkCountPill,
                allChecksDone && { backgroundColor: colors.severity.low + '18' },
                isDark && !allChecksDone && { backgroundColor: colors.dark.elevated },
              ]}>
                <Text style={[
                  s.checkCountText,
                  isDark && { color: colors.slate[400] },
                  allChecksDone && { color: colors.severity.low },
                ]}>
                  {completedCount}/{totalCount}
                </Text>
              </View>
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
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
                Actions taken
              </Text>
              <View style={s.requiredTag}>
                <Text style={s.requiredText}>Required</Text>
              </View>
            </View>
            <FocusableInput
              isDark={isDark}
              style={[
                s.textArea,
                isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white },
              ]}
              placeholder="Describe what actions were taken to resolve the incident..."
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={actionsTaken}
              onChangeText={setActionsTaken}
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
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
                Resources used
              </Text>
            </View>
            <FocusableInput
              isDark={isDark}
              style={[
                s.textArea,
                isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white },
              ]}
              placeholder="Equipment, vehicles, supplies deployed..."
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={resourcesUsed}
              onChangeText={setResourcesUsed}
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
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
                People assisted
              </Text>
            </View>

            <View style={s.peopleRow}>
              <Pressable
                onPress={decrementPeople}
                style={({ pressed }) => [
                  s.circleBtn,
                  isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                  pressed && { transform: [{ scale: 0.9 }] },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Decrease"
              >
                <Ionicons name="remove" size={22} color={isDark ? colors.white : colors.slate[700]} />
              </Pressable>

              <View style={s.peopleCenterWrap}>
                <Text style={[s.peopleCount, isDark && { color: colors.white }]}>
                  {parseInt(peopleAssisted) || 0}
                </Text>
                <Text style={[s.peopleLabel, isDark && { color: colors.slate[500] }]}>
                  {(parseInt(peopleAssisted) || 0) === 1 ? 'person' : 'people'}
                </Text>
              </View>

              <Pressable
                onPress={incrementPeople}
                style={({ pressed }) => [
                  s.circleBtn, s.circleBtnAccent,
                  pressed && { transform: [{ scale: 0.9 }] },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Increase"
              >
                <Ionicons name="add" size={22} color={colors.white} />
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
              <Text style={[s.cardTitle, isDark && { color: colors.white }]}>
                Damage assessment
              </Text>
            </View>
            <FocusableInput
              isDark={isDark}
              style={[
                s.textArea,
                isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white },
              ]}
              placeholder="Describe the extent of damage observed..."
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={damageAssessment}
              onChangeText={setDamageAssessment}
            />
          </View>
        </View>

        {/* ── Summary preview ── */}
        <View style={[s.summaryCard, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <View style={[s.summaryIconWrap, { backgroundColor: colors.brand[500] + '14' }]}>
                <Ionicons name="checkbox" size={16} color={colors.brand[500]} />
              </View>
              <Text style={[s.summaryValue, isDark && { color: colors.white }]}>{completedCount}/{totalCount}</Text>
              <Text style={[s.summaryLabel, isDark && { color: colors.slate[500] }]}>Tasks</Text>
            </View>

            <View style={[s.summaryDivider, isDark && { backgroundColor: colors.dark.border }]} />

            <View style={s.summaryItem}>
              <View style={[s.summaryIconWrap, { backgroundColor: colors.severity.low + '14' }]}>
                <Ionicons name="people" size={16} color={colors.severity.low} />
              </View>
              <Text style={[s.summaryValue, isDark && { color: colors.white }]}>
                {parseInt(peopleAssisted) || 0}
              </Text>
              <Text style={[s.summaryLabel, isDark && { color: colors.slate[500] }]}>Assisted</Text>
            </View>

            <View style={[s.summaryDivider, isDark && { backgroundColor: colors.dark.border }]} />

            <View style={s.summaryItem}>
              <View style={[s.summaryIconWrap, { backgroundColor: colors.brand[500] + '14' }]}>
                <Ionicons name="create" size={16} color={colors.brand[500]} />
              </View>
              <Text style={[s.summaryValue, isDark && { color: colors.white }]}>
                {actionsTaken.trim().length > 0 ? 'Yes' : 'No'}
              </Text>
              <Text style={[s.summaryLabel, isDark && { color: colors.slate[500] }]}>Notes</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Bottom save bar ── */}
      <View style={[
        s.bottomBar,
        {
          paddingBottom: insets.bottom + 14,
          backgroundColor: isDark ? colors.dark.surface : colors.white,
          borderTopColor: isDark ? colors.dark.border : colors.slate[100],
        },
      ]}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            s.saveBtn,
            saving && { opacity: 0.6 },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save field report"
        >
          <View style={s.saveBtnHighlight} />
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name={isExisting ? 'sync-outline' : 'save-outline'} size={18} color={colors.white} />
              <Text style={s.saveBtnText}>
                {isExisting ? 'Update Report' : 'Save Field Report'}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {sweetAlert && (
        <SweetAlertModal alert={sweetAlert} onDismiss={() => setSweetAlert(null)} isDark={isDark} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  // ── Header ──
  header: {
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 12,
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingBottom: 12, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 2,
  },
  headerRef:   { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 0.4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  savedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 4,
  },
  savedBadgeText: { fontSize: 11, fontWeight: '700', color: colors.white },

  // Progress strip
  progressStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 8,
  },
  progressMeta:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  progressLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  progressPct:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  progressBarTrack: {
    height: 4, marginHorizontal: 16, marginBottom: 16,
    borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  // ── Cards ──
  scroll: { padding: 16, gap: 14 },
  card: {
    borderRadius: 18, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardAccentBar: { width: 4 },
  cardInner:     { flex: 1, padding: 18, gap: 14 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate[900] },

  // Required tag
  requiredTag: {
    backgroundColor: colors.brand[500] + '14',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  requiredText: { fontSize: 10, fontWeight: '700', color: colors.brand[500], letterSpacing: 0.3 },

  // Checklist count pill
  checkCountPill: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10,
  },
  checkCountText: { fontSize: 12, fontWeight: '700', color: colors.slate[500] },

  // Checklist rows
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.slate[100],
  },
  checkBox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2,
    borderColor: colors.slate[300], alignItems: 'center', justifyContent: 'center',
  },
  checkLabel: { flex: 1, fontSize: 14, color: colors.slate[700] },

  // Text areas
  textArea: {
    borderWidth: 1.5, borderColor: colors.slate[200], borderRadius: 14,
    padding: 14, fontSize: 14, color: colors.slate[900], minHeight: 80,
    backgroundColor: colors.slate[50],
  },

  // People counter
  peopleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 32, paddingVertical: 8,
  },
  peopleCenterWrap: { alignItems: 'center', minWidth: 64 },
  peopleCount: {
    fontSize: 36, fontWeight: '800', color: colors.slate[900], lineHeight: 42,
  },
  peopleLabel: { fontSize: 12, color: colors.slate[400], fontWeight: '500' },
  circleBtn: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center', justifyContent: 'center',
  },
  circleBtnAccent: {
    backgroundColor: colors.brand[500], borderColor: colors.brand[500],
  },

  // Summary card
  summaryCard: {
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.slate[100],
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  summaryRow:    { flexDirection: 'row', alignItems: 'center' },
  summaryItem:   { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
  summaryIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  summaryValue:   { fontSize: 18, fontWeight: '800', color: colors.slate[900] },
  summaryLabel:   { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  summaryDivider: { width: 1, height: 40, backgroundColor: colors.slate[100] },

  // Bottom save bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 10,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand[500], borderRadius: 16,
    paddingVertical: 16, overflow: 'hidden',
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: '50%' as any,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
