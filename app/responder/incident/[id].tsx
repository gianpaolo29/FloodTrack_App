/**
 * Incident detail — premium responder view
 *
 * Full-bleed accent header · glassmorphism cards · status stepper
 * Actions: Navigate (native maps), Update status, Call reporter
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
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
import { SeverityChip } from '@/components/SeverityChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getIncidentDetail, updateIncidentStatus } from '@/services/api';
import type { IncidentDetail, ResponderStatus } from '@/types';

// ─── Status definitions ──────────────────────────────────────────────────────

const STATUS_STEPS: {
  key: ResponderStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}[] = [
  { key: 'en_route', label: 'En route',  icon: 'car',              description: 'Traveling to the incident location' },
  { key: 'on_scene', label: 'On scene',  icon: 'location',         description: 'Arrived and assessing the situation' },
  { key: 'resolved', label: 'Resolved',  icon: 'checkmark-circle', description: 'Incident has been cleared or contained' },
];

const STATUS_ORDER: ResponderStatus[] = ['pending', 'en_route', 'on_scene', 'resolved'];

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Not started',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending:  colors.slate[400],
  en_route: colors.brand[500],
  on_scene: colors.accent[500],
  resolved: colors.severity.low,
};

const STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending:  'time-outline',
  en_route: 'car-outline',
  on_scene: 'location-outline',
  resolved: 'checkmark-circle-outline',
};

// ─── Update status modal — premium ──────────────────────────────────────────

function UpdateModal({
  visible, current, onClose, onUpdate, isDark,
}: {
  visible: boolean;
  current: ResponderStatus;
  onClose: () => void;
  onUpdate: (status: ResponderStatus, notes: string) => Promise<void>;
  isDark: boolean;
}) {
  const [selected, setSelected] = useState<ResponderStatus>(current);
  const [notes, setNotes]       = useState('');
  const [loading, setLoading]   = useState(false);

  const currentIdx = STATUS_ORDER.indexOf(current);

  async function handleSubmit() {
    setLoading(true);
    try {
      await onUpdate(selected, notes);
      setNotes('');
    } finally {
      setLoading(false);
    }
  }

  const modalBg = isDark ? colors.dark.elevated : colors.white;
  const overlay = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[ms.overlay, { backgroundColor: overlay }]}>
        <View style={[ms.sheet, { backgroundColor: modalBg }]}>
          <View style={ms.handle} />

          {/* Title row */}
          <View style={ms.titleRow}>
            <View style={[ms.titleIcon, { backgroundColor: colors.accent[500] + '18' }]}>
              <Ionicons name="swap-vertical" size={18} color={colors.accent[500]} />
            </View>
            <View>
              <Text style={[ms.title, isDark && { color: colors.white }]}>Update status</Text>
              <Text style={[ms.titleSub, isDark && { color: colors.slate[500] }]}>
                Select the current response phase
              </Text>
            </View>
          </View>

          {/* Steps */}
          <View style={{ gap: 8 }}>
            {STATUS_STEPS.map((step, idx) => {
              const stepIdx  = STATUS_ORDER.indexOf(step.key);
              const active   = selected === step.key;
              const disabled = stepIdx < currentIdx;
              const completed = stepIdx < currentIdx;
              const stepColor = step.key === 'resolved' ? colors.severity.low : STATUS_COLORS[step.key];

              return (
                <Pressable
                  key={step.key}
                  onPress={() => !disabled && setSelected(step.key)}
                  disabled={disabled}
                  style={[
                    ms.stepCard,
                    isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
                    active && { borderColor: stepColor, backgroundColor: stepColor + '0C' },
                    disabled && { opacity: 0.4 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled }}
                >
                  {/* Step number / check */}
                  <View style={[
                    ms.stepNum,
                    { backgroundColor: active ? stepColor : isDark ? colors.dark.elevated : colors.slate[100] },
                    completed && { backgroundColor: colors.severity.low },
                  ]}>
                    {completed ? (
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    ) : (
                      <Ionicons
                        name={step.icon}
                        size={16}
                        color={active ? colors.white : isDark ? colors.slate[500] : colors.slate[400]}
                      />
                    )}
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[
                      ms.stepLabel,
                      isDark && { color: colors.white },
                      active && { color: stepColor },
                    ]}>
                      {step.label}
                    </Text>
                    <Text style={[ms.stepDesc, isDark && { color: colors.slate[500] }]}>
                      {step.description}
                    </Text>
                  </View>

                  {active && (
                    <View style={[ms.stepCheck, { backgroundColor: stepColor }]}>
                      <Ionicons name="checkmark" size={12} color={colors.white} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Field notes */}
          <View>
            <Text style={[ms.notesLabel, isDark && { color: colors.slate[400] }]}>Field notes</Text>
            <TextInput
              style={[
                ms.notes,
                isDark && {
                  backgroundColor: colors.dark.card,
                  borderColor: colors.dark.border,
                  color: colors.white,
                },
              ]}
              placeholder="Add observations or notes (optional)"
              placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {/* Actions */}
          <View style={ms.actions}>
            <Pressable onPress={onClose} style={[ms.cancelBtn, isDark && { borderColor: colors.dark.border }]}>
              <Text style={[ms.cancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label="Confirm update"
                onPress={handleSubmit}
                loading={loading}
                disabled={selected === current}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, gap: 18, paddingBottom: 40,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 18, fontWeight: '800', color: colors.slate[900] },
  titleSub: { fontSize: 12, color: colors.slate[400], marginTop: 1 },
  stepCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  stepNum: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { fontSize: 15, fontWeight: '600', color: colors.slate[900] },
  stepDesc:  { fontSize: 12, color: colors.slate[400] },
  stepCheck: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  notesLabel: {
    fontSize: 12, fontWeight: '600', color: colors.slate[500],
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },
  notes: {
    borderWidth: 1.5, borderColor: colors.slate[200],
    borderRadius: 12, padding: 14, fontSize: 14,
    color: colors.slate[900], minHeight: 80,
    backgroundColor: colors.white,
  },
  actions:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cancelBtn: {
    paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: colors.slate[200],
  },
  cancelText: { fontSize: 15, color: colors.slate[600], fontWeight: '600' },
});

// ─── Status stepper (visual progress) ────────────────────────────────────────

function StatusStepper({ current, isDark }: { current: ResponderStatus; isDark: boolean }) {
  const currentIdx = STATUS_ORDER.indexOf(current);

  return (
    <View style={st.root}>
      {STATUS_ORDER.map((status, idx) => {
        const isDone    = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const color     = STATUS_COLORS[status];
        const icon      = STATUS_ICONS[status];
        const isLast    = idx === STATUS_ORDER.length - 1;

        return (
          <View key={status} style={st.stepRow}>
            <View style={st.stepVisual}>
              <View style={[
                st.stepDot,
                isDone && { backgroundColor: colors.severity.low },
                isCurrent && { backgroundColor: color, borderColor: color + '40', borderWidth: 3 },
                !isDone && !isCurrent && { backgroundColor: isDark ? colors.dark.border : colors.slate[200] },
              ]}>
                {isDone && <Ionicons name="checkmark" size={10} color={colors.white} />}
                {isCurrent && <View style={[st.stepDotInner, { backgroundColor: colors.white }]} />}
              </View>
              {!isLast && (
                <View style={[
                  st.stepLine,
                  isDone && { backgroundColor: colors.severity.low },
                  !isDone && { backgroundColor: isDark ? colors.dark.border : colors.slate[200] },
                ]} />
              )}
            </View>
            <View style={st.stepText}>
              <Text style={[
                st.stepLabel,
                isDone && { color: colors.severity.low },
                isCurrent && { color, fontWeight: '700' },
                !isDone && !isCurrent && { color: isDark ? colors.slate[600] : colors.slate[400] },
              ]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  root:         { gap: 0 },
  stepRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepVisual:   { alignItems: 'center', width: 22 },
  stepDot:      {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotInner: { width: 6, height: 6, borderRadius: 3 },
  stepLine:     { width: 2, height: 20 },
  stepText:     { paddingBottom: 16, flex: 1 },
  stepLabel:    { fontSize: 13, fontWeight: '500' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function IncidentDetailScreen() {
  const { id }     = useLocalSearchParams<{ id: string }>();
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const scheme     = useColorScheme();
  const isDark     = scheme === 'dark';
  const { token }  = useAuth();

  const [incident, setIncident]   = useState<IncidentDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg   = isDark ? colors.dark.card : colors.white;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getIncidentDetail(id, token!);
      setIncident(data);
    } catch {
      setError('Could not load incident details.');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  function openNativeMaps() {
    if (!incident) return;
    const { latitude, longitude, address } = incident;
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios:     `maps:?daddr=${latitude},${longitude}&q=${encoded}`,
      android: `geo:${latitude},${longitude}?q=${encoded}`,
    });
    if (url) Linking.openURL(url);
  }

  function callReporter() {
    if (!incident) return;
    Linking.openURL(`tel:${incident.contactNumber}`);
  }

  async function handleStatusUpdate(newStatus: ResponderStatus, notes: string) {
    if (!incident) return;
    await updateIncidentStatus({ incidentId: incident.id, status: newStatus, notes }, token!);
    setIncident(prev => prev ? { ...prev, responderStatus: newStatus } : prev);
    setModalVisible(false);
    if (newStatus === 'resolved') {
      Alert.alert(
        'Incident resolved',
        'Great work! The incident has been marked as resolved.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }

  const statusColor = incident ? STATUS_COLORS[incident.responderStatus] : colors.slate[400];
  const statusLabel = incident ? STATUS_LABELS[incident.responderStatus] : '';
  const statusIcon  = incident ? STATUS_ICONS[incident.responderStatus] : 'time-outline' as const;
  const isResolved  = incident?.responderStatus === 'resolved';

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Background accent */}
        <View style={[styles.headerBg, { backgroundColor: isDark ? colors.dark.surface : colors.accent[700] }]} />

        <View style={styles.headerContent}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>

          <View style={{ flex: 1, gap: 3 }}>
            {incident && (
              <>
                <Text style={styles.headerRef}>{incident.reference}</Text>
                <Text style={styles.headerTitle} numberOfLines={1}>{incident.title}</Text>
              </>
            )}
          </View>

          {incident && (
            <View style={[styles.headerStatus, { backgroundColor: statusColor + '28', borderColor: 'rgba(255,255,255,0.25)' }]}>
              <Ionicons name={statusIcon} size={12} color={colors.white} />
              <Text style={styles.headerStatusText}>{statusLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.centered}>
          <View style={[styles.errorIconWrap, isDark && { backgroundColor: colors.dark.card }]}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.slate[400]} />
          </View>
          <Text style={[styles.errorTitle, isDark && { color: colors.white }]}>Connection issue</Text>
          <Text style={[styles.errorBody, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
            <Ionicons name="refresh" size={15} color={colors.white} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!loading && !error && incident && (
        <>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Severity + description card ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.severityRow}>
                <SeverityChip level={incident.severity} size="lg" />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.typeRow}>
                    <View style={[styles.typePill, isDark && { backgroundColor: colors.dark.elevated }]}>
                      <Text style={[styles.typeText, isDark && { color: colors.slate[400] }]}>
                        {incident.type}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.addressRow}>
                    <Ionicons name="location" size={13} color={colors.accent[500]} />
                    <Text style={[styles.addressText, isDark && { color: colors.slate[400] }]}>
                      {incident.address}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.descDivider, isDark && { backgroundColor: colors.dark.border }]} />

              <Text style={[styles.description, isDark && { color: colors.slate[400] }]}>
                {incident.description}
              </Text>
            </View>

            {/* ── Response progress card ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.accent[500] + '18' }]}>
                  <Ionicons name="git-branch-outline" size={16} color={colors.accent[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Response progress
                </Text>
              </View>
              <StatusStepper current={incident.responderStatus} isDark={isDark} />
            </View>

            {/* ── Route / navigation card ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.accent[500] + '18' }]}>
                  <Ionicons name="navigate" size={16} color={colors.accent[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Route to incident
                </Text>
                <Pressable
                  onPress={openNativeMaps}
                  style={styles.navChipBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Open navigation"
                >
                  <Ionicons name="open-outline" size={12} color={colors.white} />
                  <Text style={styles.navChipText}>Open Maps</Text>
                </Pressable>
              </View>

              <View style={[styles.routeBlock, isDark && { backgroundColor: colors.dark.elevated }]}>
                <View style={styles.routeVisual}>
                  <View style={styles.routeStart}>
                    <Ionicons name="car" size={20} color={colors.accent[500]} />
                  </View>
                  <View style={[styles.routeLine, { backgroundColor: colors.accent[500] + '40' }]} />
                  <View style={[styles.routeEnd, { borderColor: colors.severity[incident.severity] }]}>
                    <View style={[styles.routeEndDot, { backgroundColor: colors.severity[incident.severity] }]} />
                  </View>
                </View>
                <View style={styles.routeInfo}>
                  <Text style={[styles.routeFrom, isDark && { color: colors.slate[400] }]}>Your location</Text>
                  <Text style={[styles.routeTo, isDark && { color: colors.white }]}>{incident.address}</Text>
                </View>
              </View>
            </View>

            {/* ── Evidence card ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                  <Ionicons name="images" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Submitted evidence
                </Text>
                <View style={[styles.evidenceCountPill, isDark && { backgroundColor: colors.dark.elevated }]}>
                  <Text style={[styles.evidenceCountText, isDark && { color: colors.slate[400] }]}>
                    {incident.evidenceCount}
                  </Text>
                </View>
              </View>

              <View style={[styles.evidenceGrid, isDark && { backgroundColor: colors.dark.elevated }]}>
                <Ionicons name="images-outline" size={28} color={colors.slate[400]} />
                <Text style={[styles.evidenceText, isDark && { color: colors.slate[500] }]}>
                  {incident.evidenceCount} photo{incident.evidenceCount !== 1 ? 's' : ''} attached
                </Text>
              </View>
            </View>

            {/* ── Reporter card ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                  <Ionicons name="person" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Reporter
                </Text>
              </View>

              <View style={styles.reporterRow}>
                <View style={[styles.reporterAvatar, isDark && { backgroundColor: colors.dark.elevated }]}>
                  <Text style={[styles.reporterInitials, isDark && { color: colors.brand[300] }]}>
                    {incident.reportedBy.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.reporterName, isDark && { color: colors.white }]}>
                    {incident.reportedBy}
                  </Text>
                  <View style={styles.reporterMeta}>
                    <Ionicons name="time-outline" size={11} color={isDark ? colors.slate[600] : colors.slate[400]} />
                    <Text style={[styles.reporterTime, isDark && { color: colors.slate[500] }]}>
                      {incident.reportedAt}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={callReporter}
                  style={[styles.callBtn, isDark && { backgroundColor: colors.dark.elevated }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${incident.reportedBy}`}
                >
                  <Ionicons name="call" size={16} color={colors.accent[500]} />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* ── Bottom action bar ── */}
          <View style={[
            styles.actionBar,
            {
              paddingBottom: insets.bottom + 14,
              backgroundColor: isDark ? colors.dark.surface : colors.white,
              borderTopColor: isDark ? colors.dark.border : colors.slate[100],
            },
          ]}>
            {isResolved ? (
              <View style={styles.resolvedBanner}>
                <View style={styles.resolvedIcon}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                </View>
                <Text style={styles.resolvedText}>Incident resolved</Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={openNativeMaps}
                  style={[styles.navActionBtn, isDark && { borderColor: colors.dark.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Navigate to incident"
                >
                  <Ionicons name="navigate" size={18} color={colors.accent[500]} />
                </Pressable>
                <Pressable
                  onPress={callReporter}
                  style={[styles.callActionBtn, isDark && { borderColor: colors.dark.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Call reporter"
                >
                  <Ionicons name="call" size={18} color={colors.brand[500]} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Update status"
                    onPress={() => setModalVisible(true)}
                    variant="secondary"
                    fullWidth
                    size="lg"
                  />
                </View>
              </>
            )}
          </View>

          {/* ── Update modal ── */}
          <UpdateModal
            visible={modalVisible}
            current={incident.responderStatus}
            onClose={() => setModalVisible(false)}
            onUpdate={handleStatusUpdate}
            isDark={isDark}
          />
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  // ── Header ──
  header: { position: 'relative', zIndex: 10 },
  headerBg: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 20, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  headerRef:    { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 0.3 },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: colors.white },
  headerStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  headerStatusText: { fontSize: 11, fontWeight: '700', color: colors.white },

  // ── Scroll ──
  scroll: { padding: 16, gap: 14, paddingTop: 14 },

  // ── Card ──
  card: {
    borderRadius: 18, padding: 18, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeaderIcon: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate[900] },

  // Severity row
  severityRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  typeRow:     { flexDirection: 'row' },
  typePill: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8,
  },
  typeText:    { fontSize: 12, fontWeight: '600', color: colors.slate[500] },
  addressRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  addressText: { fontSize: 13, color: colors.slate[500], flex: 1 },
  descDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.slate[100] },
  description: { fontSize: 13, color: colors.slate[600], lineHeight: 21 },

  // Route block
  navChipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accent[500],
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  navChipText: { fontSize: 11, color: colors.white, fontWeight: '700' },
  routeBlock: {
    borderRadius: 14, padding: 16,
    backgroundColor: '#EAF4FC',
    flexDirection: 'row', gap: 14, alignItems: 'center',
  },
  routeVisual: { alignItems: 'center', gap: 4 },
  routeStart: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.accent[100],
    alignItems: 'center', justifyContent: 'center',
  },
  routeLine: { width: 2, height: 16, borderRadius: 1 },
  routeEnd: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  routeEndDot: { width: 12, height: 12, borderRadius: 6 },
  routeInfo: { flex: 1, gap: 4 },
  routeFrom: { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  routeTo:   { fontSize: 14, fontWeight: '600', color: colors.slate[900], lineHeight: 20 },

  // Evidence
  evidenceCountPill: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  evidenceCountText: { fontSize: 12, fontWeight: '700', color: colors.slate[500] },
  evidenceGrid: {
    height: 100, borderRadius: 14,
    backgroundColor: colors.slate[50],
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  evidenceText: { fontSize: 13, color: colors.slate[500], fontWeight: '500' },

  // Reporter
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reporterAvatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  reporterInitials: { fontSize: 16, fontWeight: '800', color: colors.brand[700] },
  reporterName: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  reporterMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reporterTime: { fontSize: 12, color: colors.slate[400] },
  callBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.accent[100],
    alignItems: 'center', justifyContent: 'center',
  },

  // Action bar
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  navActionBtn: {
    width: 52, height: 52, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.accent[500],
    alignItems: 'center', justifyContent: 'center',
  },
  callActionBtn: {
    width: 52, height: 52, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
  },
  resolvedBanner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14,
  },
  resolvedIcon: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: colors.severity.low,
    alignItems: 'center', justifyContent: 'center',
  },
  resolvedText: { fontSize: 16, color: colors.severity.low, fontWeight: '700' },

  // Error
  errorIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center',
  },
  errorTitle: { fontSize: 17, fontWeight: '700', color: colors.slate[900] },
  errorBody:  { fontSize: 13, color: colors.slate[500], textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent[500],
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
