/**
 * Incident detail + navigate screen (Responder role) — loads from API service.
 *
 * Shows: map route placeholder, evidence count, reporter info.
 * Actions: Navigate (opens native maps), Update status, Mark resolved.
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

// ─── Status step definitions ──────────────────────────────────────────────────

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

// ─── Update status modal ──────────────────────────────────────────────────────

function UpdateModal({
  visible,
  current,
  onClose,
  onUpdate,
  isDark,
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

  const modalBg = isDark ? '#0D1117' : colors.white;
  const overlay = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[modalStyles.overlay, { backgroundColor: overlay }]}>
        <View style={[modalStyles.sheet, { backgroundColor: modalBg }]}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, isDark && { color: colors.white }]}>Update status</Text>

          <View style={{ gap: 10 }}>
            {STATUS_STEPS.map(step => {
              const stepIdx  = STATUS_ORDER.indexOf(step.key);
              const active   = selected === step.key;
              const disabled = stepIdx < currentIdx;

              return (
                <Pressable
                  key={step.key}
                  onPress={() => !disabled && setSelected(step.key)}
                  style={[
                    modalStyles.stepCard,
                    isDark && { backgroundColor: colors.slate[900] },
                    active && { borderColor: colors.brand[500], backgroundColor: colors.brand[50] },
                    disabled && { opacity: 0.45 },
                  ]}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled }}
                  accessibilityLabel={`${step.label}: ${step.description}`}
                >
                  <View
                    style={[
                      modalStyles.stepIcon,
                      { backgroundColor: active ? colors.brand[500] + '18' : isDark ? colors.slate[900] : colors.slate[100] },
                    ]}
                  >
                    <Ionicons
                      name={step.key === 'resolved' ? 'checkmark-circle' : step.icon}
                      size={20}
                      color={
                        step.key === 'resolved'
                          ? colors.severity.low
                          : active
                          ? colors.brand[500]
                          : colors.slate[400]
                      }
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[modalStyles.stepLabel, isDark && { color: colors.white }, active && { color: colors.brand[500] }]}>
                      {step.label}
                    </Text>
                    <Text style={[modalStyles.stepDesc, isDark && { color: colors.slate[400] }]}>
                      {step.description}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={18} color={colors.brand[500]} />}
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[
              modalStyles.notes,
              isDark && {
                backgroundColor: colors.slate[900],
                borderColor: colors.slate[600] + '66',
                color: colors.white,
              },
            ]}
            placeholder="Add field notes (optional)"
            placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            accessibilityLabel="Field notes"
          />

          <View style={modalStyles.actions}>
            <Pressable
              onPress={onClose}
              style={modalStyles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[modalStyles.cancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label="Update status"
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

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.slate[200],
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title:    { fontSize: 18, fontWeight: '700', color: colors.slate[900] },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 14, fontWeight: '600', color: colors.slate[900] },
  stepDesc:  { fontSize: 12, color: colors.slate[400] },
  notes: {
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.slate[900],
    minHeight: 80,
    backgroundColor: colors.white,
  },
  actions:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cancelBtn:  { paddingHorizontal: 16, paddingVertical: 14 },
  cancelText: { fontSize: 15, color: colors.slate[600], fontWeight: '500' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  const screenBg = isDark ? '#0D1117' : colors.slate[50];
  const cardBg   = isDark ? colors.slate[900] : colors.white;

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
    const encodedAddress = encodeURIComponent(address);
    const url = Platform.select({
      ios:     `maps:?daddr=${latitude},${longitude}&q=${encodedAddress}`,
      android: `geo:${latitude},${longitude}?q=${encodedAddress}`,
    });
    if (url) Linking.openURL(url);
  }

  function callReporter() {
    if (!incident) return;
    Linking.openURL(`tel:${incident.contactNumber}`);
  }

  async function handleStatusUpdate(newStatus: ResponderStatus, notes: string) {
    if (!incident) return;
    await updateIncidentStatus({ incidentId: incident.id, status: newStatus, notes });
    setIncident(prev => prev ? { ...prev, responderStatus: newStatus } : prev);
    setModalVisible(false);
    if (newStatus === 'resolved') {
      Alert.alert(
        'Incident resolved',
        'The incident has been marked as resolved. Great work!',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }

  const statusColor = incident ? STATUS_COLORS[incident.responderStatus] : colors.slate[400];
  const statusLabel = incident ? STATUS_LABELS[incident.responderStatus] : '';

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.accent[700] }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          {incident && (
            <>
              <Text style={styles.headerRef}>{incident.reference}</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{incident.title}</Text>
            </>
          )}
        </View>
        {incident && (
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22', borderColor: 'rgba(255,255,255,0.35)' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: colors.white }]}>{statusLabel}</Text>
          </View>
        )}
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
          <Ionicons name="cloud-offline-outline" size={40} color={colors.slate[200]} />
          <Text style={[styles.errorText, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!loading && !error && incident && (
        <>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Severity + description ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.severityRow}>
                <SeverityChip level={incident.severity} size="lg" />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.incidentType, isDark && { color: colors.slate[400] }]}>
                    {incident.type}
                  </Text>
                  <View style={styles.addressRow}>
                    <Ionicons name="location-outline" size={13} color={colors.slate[400]} />
                    <Text style={[styles.addressText, isDark && { color: colors.slate[400] }]}>
                      {incident.address}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.description, isDark && { color: colors.slate[400] }]}>
                {incident.description}
              </Text>
            </View>

            {/* ── Map / route ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>
                  Route to incident
                </Text>
                <Pressable
                  onPress={openNativeMaps}
                  style={styles.navigateBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Open navigation"
                >
                  <Ionicons name="navigate" size={14} color={colors.white} />
                  <Text style={styles.navigateBtnText}>Navigate</Text>
                </Pressable>
              </View>
              <View style={[styles.mapBlock, isDark && { backgroundColor: colors.slate[900] }]}>
                <View style={styles.mapRouteIcon}>
                  <Ionicons name="car" size={28} color={colors.accent[500]} />
                </View>
                <Ionicons name="ellipsis-vertical" size={14} color={colors.accent[500]} style={{ marginVertical: 4 }} />
                <View style={[styles.mapDestIcon, { borderColor: colors.severity[incident.severity] }]}>
                  <View style={[styles.mapDestDot, { backgroundColor: colors.severity[incident.severity] }]} />
                </View>
                <Text style={[styles.mapBlockText, isDark && { color: colors.slate[400] }]}>
                  {incident.address}
                </Text>
                <Text style={[styles.mapBlockHint, isDark && { color: colors.slate[600] }]}>
                  Tap Navigate to open in Maps
                </Text>
              </View>
            </View>

            {/* ── Evidence ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>
                Submitted evidence
              </Text>
              <View style={[styles.evidencePlaceholder, isDark && { backgroundColor: colors.slate[900] }]}>
                <Ionicons name="images-outline" size={32} color={colors.slate[400]} />
                <Text style={[styles.evidenceText, isDark && { color: colors.slate[400] }]}>
                  {incident.evidenceCount} photo{incident.evidenceCount !== 1 ? 's' : ''} submitted
                </Text>
              </View>
            </View>

            {/* ── Reporter info ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>Reporter</Text>
              <View style={styles.reporterRow}>
                <View style={styles.reporterAvatar}>
                  <Text style={styles.reporterAvatarText}>
                    {incident.reportedBy.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.reporterName, isDark && { color: colors.white }]}>
                    {incident.reportedBy}
                  </Text>
                  <Text style={[styles.reporterTime, isDark && { color: colors.slate[400] }]}>
                    Reported {incident.reportedAt}
                  </Text>
                </View>
                <Pressable
                  onPress={callReporter}
                  style={styles.callBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${incident.reportedBy}`}
                >
                  <Ionicons name="call" size={16} color={colors.accent[500]} />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* ── Bottom action bar ── */}
          {incident.responderStatus !== 'resolved' ? (
            <View
              style={[
                styles.actionBar,
                {
                  paddingBottom: insets.bottom + 12,
                  backgroundColor: isDark ? '#0D1117' : colors.white,
                  borderTopColor: isDark ? colors.slate[900] : colors.slate[100],
                },
              ]}
            >
              <Pressable
                onPress={openNativeMaps}
                style={styles.navActionBtn}
                accessibilityRole="button"
                accessibilityLabel="Navigate to incident"
              >
                <Ionicons name="navigate-outline" size={20} color={colors.accent[500]} />
                <Text style={styles.navActionText}>Navigate</Text>
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
            </View>
          ) : (
            <View
              style={[
                styles.actionBar,
                {
                  paddingBottom: insets.bottom + 12,
                  backgroundColor: isDark ? '#0D1117' : colors.white,
                  borderTopColor: isDark ? colors.slate[900] : colors.slate[100],
                },
              ]}
            >
              <View style={styles.resolvedBanner}>
                <Ionicons name="checkmark-circle" size={20} color={colors.severity.low} />
                <Text style={styles.resolvedText}>This incident has been resolved</Text>
              </View>
            </View>
          )}

          {/* ── Update status modal ── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRef:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot:      { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '600' },

  scroll: { padding: 16, gap: 12 },

  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: colors.slate[900] },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent[500],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  navigateBtnText: { fontSize: 12, color: colors.white, fontWeight: '600' },

  severityRow:  { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  incidentType: { fontSize: 13, color: colors.slate[400], fontWeight: '500' },
  addressRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressText:  { fontSize: 13, color: colors.slate[600], flex: 1 },
  description:  { fontSize: 13, color: colors.slate[600], lineHeight: 20 },

  mapBlock: {
    height: 160,
    borderRadius: 10,
    backgroundColor: '#D6E8F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  mapRouteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapDestIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  mapDestDot:   { width: 12, height: 12, borderRadius: 6 },
  mapBlockText: { fontSize: 12, color: colors.slate[600], fontWeight: '500', marginTop: 4 },
  mapBlockHint: { fontSize: 10, color: colors.slate[400] },

  evidencePlaceholder: {
    height: 100,
    borderRadius: 10,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  evidenceText: { fontSize: 13, color: colors.slate[600] },

  reporterRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reporterAvatar:     {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  reporterAvatarText: { fontSize: 14, fontWeight: '700', color: colors.brand[700] },
  reporterName:       { fontSize: 15, fontWeight: '600', color: colors.slate[900] },
  reporterTime:       { fontSize: 12, color: colors.slate[400] },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  navActionBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navActionText: { fontSize: 9, color: colors.accent[500], fontWeight: '600' },
  resolvedBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  resolvedText: { fontSize: 15, color: colors.severity.low, fontWeight: '600' },

  errorText: { fontSize: 14, color: colors.slate[600], textAlign: 'center' },
  retryBtn:  { backgroundColor: colors.accent[500], paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
