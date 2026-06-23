/**
 * Submit report screen — multi-step wizard
 *
 * Step 1: Location (auto-detected via expo-location, address reverse-geocoded)
 * Step 2: Hazard type
 * Step 3: Severity
 * Step 4: Evidence (photo/video — wires to expo-image-picker)
 * Step 5: Description + submit → confirmation
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { colors } from '@/theme/colors';
import { SeverityChip, type Severity } from '@/components/SeverityChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { submitReport } from '@/services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

const HAZARD_TYPES = [
  { key: 'flood',    label: 'Flood',         icon: 'water'            as const },
  { key: 'road',     label: 'Road damage',   icon: 'construct'        as const },
  { key: 'debris',   label: 'Debris',        icon: 'layers'           as const },
  { key: 'drainage', label: 'Drainage',      icon: 'git-merge'        as const },
  { key: 'landslide',label: 'Landslide',     icon: 'triangle'         as const },
  { key: 'other',    label: 'Other',         icon: 'ellipsis-horizontal' as const },
];

type HazardKey = typeof HAZARD_TYPES[number]['key'];

interface SeverityOption {
  level: Severity;
  label: string;
  description: string;
}

const SEVERITY_OPTIONS: SeverityOption[] = [
  { level: 'low',      label: 'Low',      description: 'Passable, monitor only'            },
  { level: 'moderate', label: 'Moderate', description: 'Caution, may worsen'               },
  { level: 'high',     label: 'High',     description: 'Unsafe, prompt action needed'      },
  { level: 'critical', label: 'Critical', description: 'Life-threatening, immediate dispatch' },
];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            stepStyles.dot,
            i < current
              ? { backgroundColor: colors.brand[500] }
              : i === current
              ? { backgroundColor: colors.brand[500], width: 24 }
              : { backgroundColor: colors.slate[200] },
          ]}
        />
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, width: 6, borderRadius: 3 },
});

// ─── Step 1 — Location ────────────────────────────────────────────────────────

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

function LocationStep({
  isDark,
  location,
  onLocationChange,
}: {
  isDark: boolean;
  location: LocationData | null;
  onLocationChange: (loc: LocationData) => void;
}) {
  const [detecting, setDetecting] = useState(false);

  async function detectLocation() {
    setDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission denied',
          'Location permission is needed to auto-detect where you are. You can still type your address manually.',
        );
        setDetecting(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [geo] = await Location.reverseGeocodeAsync({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      const parts = [geo?.street, geo?.district, geo?.city, geo?.region].filter(Boolean);
      const address = parts.length ? parts.join(', ') : `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;

      onLocationChange({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        address,
      });
    } catch {
      Alert.alert('Error', 'Could not detect your location. Please try again.');
    } finally {
      setDetecting(false);
    }
  }

  // Auto-detect on mount
  useEffect(() => {
    if (!location) detectLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        Where is the hazard?
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Your location has been detected. Tap refresh to re-detect.
      </Text>

      {/* Map / location visual */}
      <View style={[styles.mapBlock, isDark && { backgroundColor: colors.slate[900] }]}>
        {detecting ? (
          <ActivityIndicator size="large" color={colors.brand[500]} />
        ) : location ? (
          <View style={styles.mapBlockInner}>
            <Ionicons name="location" size={36} color={colors.brand[500]} />
            <Text style={[styles.mapBlockText, isDark && { color: colors.slate[400] }]}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </Text>
          </View>
        ) : (
          <View style={styles.mapBlockInner}>
            <Ionicons name="location-outline" size={32} color={colors.slate[400]} />
            <Text style={[styles.mapBlockText, isDark && { color: colors.slate[400] }]}>
              Tap refresh to detect location
            </Text>
          </View>
        )}
      </View>

      {/* Address display */}
      <View style={[styles.addressBlock, isDark && { backgroundColor: colors.slate[900] }]}>
        <Ionicons name="location-outline" size={16} color={colors.brand[500]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.addressLabel, isDark && { color: colors.slate[400] }]}>
            Detected address
          </Text>
          <Text style={[styles.addressValue, isDark && { color: colors.white }]}>
            {location ? location.address : detecting ? 'Detecting…' : 'Not detected yet'}
          </Text>
        </View>
        <Pressable
          onPress={detectLocation}
          accessibilityRole="button"
          accessibilityLabel="Re-detect location"
          hitSlop={8}
          disabled={detecting}
        >
          <Ionicons name="refresh" size={18} color={detecting ? colors.slate[400] : colors.brand[500]} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Step 2 — Hazard type ─────────────────────────────────────────────────────

function HazardTypeStep({
  selected,
  onSelect,
  isDark,
}: {
  selected: HazardKey | null;
  onSelect: (k: HazardKey) => void;
  isDark: boolean;
}) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        What type of hazard?
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Select the category that best describes the situation.
      </Text>

      <View style={styles.hazardGrid}>
        {HAZARD_TYPES.map(h => {
          const active = selected === h.key;
          return (
            <Pressable
              key={h.key}
              onPress={() => onSelect(h.key as HazardKey)}
              style={[
                styles.hazardCard,
                isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[200] + '44' },
                active && { borderColor: colors.brand[500], backgroundColor: colors.brand[50] },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={h.label}
            >
              <Ionicons
                name={h.icon}
                size={22}
                color={active ? colors.brand[500] : isDark ? colors.slate[400] : colors.slate[600]}
              />
              <Text
                style={[
                  styles.hazardLabel,
                  isDark && { color: colors.slate[400] },
                  active && { color: colors.brand[500], fontWeight: '600' },
                ]}
              >
                {h.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Step 3 — Severity ───────────────────────────────────────────────────────

function SeverityStep({
  selected,
  onSelect,
  isDark,
}: {
  selected: Severity | null;
  onSelect: (s: Severity) => void;
  isDark: boolean;
}) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        How severe is it?
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Choose the level that best describes the danger.
      </Text>

      <View style={{ gap: 10 }}>
        {SEVERITY_OPTIONS.map(opt => {
          const active    = selected === opt.level;
          const levelColor = colors.severity[opt.level];
          return (
            <Pressable
              key={opt.level}
              onPress={() => onSelect(opt.level)}
              style={[
                styles.severityCard,
                isDark && { backgroundColor: colors.slate[900] },
                active && {
                  borderColor: levelColor,
                  backgroundColor: opt.level === 'critical'
                    ? levelColor + '18'
                    : levelColor + '14',
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${opt.label}: ${opt.description}`}
            >
              <View style={[styles.severityLeft, { borderColor: levelColor, backgroundColor: levelColor + '18' }]}>
                <Ionicons
                  name={
                    opt.level === 'low'      ? 'information-circle' :
                    opt.level === 'moderate' ? 'warning'            :
                    opt.level === 'high'     ? 'alert-circle'       : 'alert'
                  }
                  size={22}
                  color={levelColor}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.severityLabel, isDark && { color: colors.white }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.severityDesc, isDark && { color: colors.slate[400] }]}>
                  {opt.description}
                </Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={20} color={levelColor} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Step 4 — Evidence ───────────────────────────────────────────────────────

function EvidenceStep({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        Add photo evidence
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Optional but strongly recommended. Helps admins verify faster.
      </Text>

      <View style={styles.evidenceGrid}>
        {/* Add photo button */}
        <Pressable
          style={[styles.evidenceAdd, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[600] }]}
          accessibilityRole="button"
          accessibilityLabel="Take a photo"
        >
          <Ionicons name="camera" size={28} color={colors.brand[500]} />
          <Text style={[styles.evidenceAddLabel, isDark && { color: colors.slate[400] }]}>
            Camera
          </Text>
        </Pressable>
        <Pressable
          style={[styles.evidenceAdd, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[600] }]}
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
        >
          <Ionicons name="images" size={28} color={colors.brand[500]} />
          <Text style={[styles.evidenceAddLabel, isDark && { color: colors.slate[400] }]}>
            Gallery
          </Text>
        </Pressable>
      </View>

      <View style={[styles.evidenceHint, isDark && { backgroundColor: colors.slate[900] }]}>
        <Ionicons name="information-circle-outline" size={14} color={colors.brand[500]} />
        <Text style={[styles.evidenceHintText, isDark && { color: colors.slate[400] }]}>
          You can add up to 5 photos or 1 short video. Install expo-image-picker to enable capture.
        </Text>
      </View>
    </View>
  );
}

// ─── Step 5 — Description + submit ───────────────────────────────────────────

function DescriptionStep({
  value,
  onChange,
  isDark,
}: {
  value: string;
  onChange: (v: string) => void;
  isDark: boolean;
}) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        Additional details
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Optional. Describe what you see, any vehicles involved, etc.
      </Text>

      <TextInput
        style={[
          styles.textarea,
          isDark && {
            backgroundColor: colors.slate[900],
            borderColor: colors.slate[600] + '88',
            color: colors.white,
          },
        ]}
        placeholder="E.g. Water is about knee-deep, road is impassable for small vehicles..."
        placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        value={value}
        onChangeText={onChange}
        accessibilityLabel="Additional description"
        maxLength={500}
      />
      <Text style={[styles.charCount, isDark && { color: colors.slate[600] }]}>
        {value.length}/500
      </Text>
    </View>
  );
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function ConfirmationScreen({ reference, onDone }: { reference: string; onDone: () => void }) {
  return (
    <View style={styles.confirmRoot}>
      <View style={styles.confirmIcon}>
        <Ionicons name="checkmark-circle" size={64} color={colors.severity.low} />
      </View>
      <Text style={styles.confirmTitle}>Report submitted</Text>
      <Text style={styles.confirmSub}>
        Your report has been received.{reference ? (
          <> Reference:{' '}
            <Text style={{ fontWeight: '700', color: colors.brand[500] }}>{reference}</Text>
          </>
        ) : null}
      </Text>
      <Text style={styles.confirmNote}>
        You'll be notified when an admin verifies your report. Track it under "My Reports".
      </Text>
      <PrimaryButton label="Back to map" onPress={onDone} fullWidth size="lg" />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';
  const { token } = useAuth();

  const [step, setStep]                   = useState(0);
  const [location, setLocation]           = useState<LocationData | null>(null);
  const [hazardType, setHazardType]       = useState<HazardKey | null>(null);
  const [severity, setSeverity]           = useState<Severity | null>(null);
  const [description, setDescription]     = useState('');
  const [submitted, setSubmitted]         = useState(false);
  const [submittedRef, setSubmittedRef]   = useState('');
  const [loading, setLoading]             = useState(false);

  const screenBg = isDark ? colors.slate[900] : colors.slate[50];
  const cardBg   = isDark ? '#0D1117' : colors.white;

  const STEP_TITLES = [
    'Location',
    'Hazard type',
    'Severity',
    'Evidence',
    'Description',
  ];

  function canAdvance() {
    if (step === 0 && !location)    return false;
    if (step === 1 && !hazardType)  return false;
    if (step === 2 && !severity)    return false;
    return true;
  }

  function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const result = await submitReport(
        {
          latitude:   location!.latitude,
          longitude:  location!.longitude,
          address:    location!.address,
          hazardType: hazardType!,
          severity:   severity!,
          description,
        },
        token!,
      );
      setSubmittedRef(result.reference ?? '');
      setSubmitted(true);
    } catch {
      Alert.alert('Submission failed', 'Could not submit your report. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <ConfirmationScreen
        reference={submittedRef}
        onDone={() => {
          setSubmitted(false);
          setStep(0);
          setLocation(null);
          setHazardType(null);
          setSeverity(null);
          setDescription('');
          router.replace('/resident');
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.brand[500] }]}>
        <Pressable
          onPress={step === 0 ? () => router.back() : () => setStep(s => s - 1)}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.headerTitle}>Report hazard</Text>
          <Text style={styles.headerStep}>
            Step {step + 1} of {TOTAL_STEPS} — {STEP_TITLES[step]}
          </Text>
        </View>

        <StepIndicator current={step} total={TOTAL_STEPS} />
      </View>

      {/* ── Step content ── */}
      <ScrollView
        style={[styles.scroll, { backgroundColor: cardBg }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <LocationStep
            isDark={isDark}
            location={location}
            onLocationChange={setLocation}
          />
        )}
        {step === 1 && (
          <HazardTypeStep
            selected={hazardType}
            onSelect={setHazardType}
            isDark={isDark}
          />
        )}
        {step === 2 && (
          <SeverityStep
            selected={severity}
            onSelect={setSeverity}
            isDark={isDark}
          />
        )}
        {step === 3 && <EvidenceStep isDark={isDark} />}
        {step === 4 && (
          <DescriptionStep
            value={description}
            onChange={setDescription}
            isDark={isDark}
          />
        )}
      </ScrollView>

      {/* ── Bottom action bar ── */}
      <View
        style={[
          styles.actionBar,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: cardBg,
            borderTopColor: isDark ? colors.slate[900] : colors.slate[100],
          },
        ]}
      >
        {/* Summary chips when type + severity are set */}
        {(hazardType || severity) && (
          <View style={styles.summaryRow}>
            {hazardType && (
              <View style={[styles.summaryChip, isDark && { backgroundColor: colors.slate[900] }]}>
                <Text style={[styles.summaryChipText, isDark && { color: colors.slate[400] }]}>
                  {HAZARD_TYPES.find(h => h.key === hazardType)?.label}
                </Text>
              </View>
            )}
            {severity && <SeverityChip level={severity} size="sm" />}
          </View>
        )}

        <PrimaryButton
          label={step < TOTAL_STEPS - 1 ? 'Continue' : 'Submit report'}
          onPress={handleNext}
          disabled={!canAdvance()}
          loading={loading}
          fullWidth
          size="lg"
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  headerStep:  { fontSize: 12, color: 'rgba(255,255,255,0.72)' },

  // Scroll
  scroll: { flex: 1 },

  // Shared step
  stepBody: { padding: 24, gap: 20 },
  stepTitle:    { fontSize: 20, fontWeight: '700', color: colors.slate[900] },
  stepSubtitle: { fontSize: 14, color: colors.slate[600], lineHeight: 20 },

  // Location step
  mapBlock: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#D6E8F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.brand[100],
    borderStyle: 'dashed',
  },
  mapBlockInner: { alignItems: 'center', gap: 6 },
  mapBlockText:  { fontSize: 13, color: colors.slate[600] },
  mapBlockSub:   { fontSize: 11, color: colors.slate[400] },
  addressBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brand[50],
    borderRadius: 10,
    padding: 14,
  },
  addressLabel: { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  addressValue: { fontSize: 14, color: colors.slate[900], fontWeight: '600' },

  // Hazard type step
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  hazardCard: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    minHeight: 80,
  },
  hazardLabel: { fontSize: 12, color: colors.slate[600], textAlign: 'center' },

  // Severity step
  severityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  severityLeft: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityLabel: { fontSize: 15, fontWeight: '600', color: colors.slate[900] },
  severityDesc:  { fontSize: 12, color: colors.slate[600] },

  // Evidence step
  evidenceGrid: { flexDirection: 'row', gap: 12 },
  evidenceAdd: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.brand[100],
    backgroundColor: colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxHeight: 120,
  },
  evidenceAddLabel: { fontSize: 13, color: colors.brand[500], fontWeight: '500' },
  evidenceHint: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.brand[50],
    borderRadius: 8,
    padding: 12,
  },
  evidenceHintText: { flex: 1, fontSize: 12, color: colors.slate[600], lineHeight: 18 },

  // Description step
  textarea: {
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.slate[900],
    minHeight: 130,
    backgroundColor: colors.white,
  },
  charCount: { fontSize: 12, color: colors.slate[400], alignSelf: 'flex-end' },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  summaryRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  summaryChip: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  summaryChipText: { fontSize: 12, color: colors.slate[600], fontWeight: '500' },

  // Confirmation
  confirmRoot: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  confirmIcon:  { marginBottom: 8 },
  confirmTitle: { fontSize: 24, fontWeight: '800', color: colors.slate[900], textAlign: 'center' },
  confirmSub:   { fontSize: 15, color: colors.slate[600], textAlign: 'center', lineHeight: 22 },
  confirmNote:  { fontSize: 13, color: colors.slate[400], textAlign: 'center', lineHeight: 20 },
});
