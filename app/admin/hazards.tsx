import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import {
  getHazards,
  createHazard,
  updateHazard,
  deleteHazard,
} from '@/services/api';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Region,
} from '@/components/MapView';
import type { Hazard, HazardCategoryType, HazardPayload, Severity } from '@/types';

/* ───────────────────── constants ───────────────────── */

const INITIAL_REGION: Region = {
  latitude: 14.0771,
  longitude: 120.6361,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

interface HazardTypeDef {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const FLOOD_TYPES: HazardTypeDef[] = [
  { key: 'flash_flood',   label: 'Flash Flood',           icon: 'thunderstorm', color: colors.floodHazard.flashFlood },
  { key: 'river_flood',   label: 'River Overflow',        icon: 'water',        color: colors.floodHazard.riverFlood },
  { key: 'coastal_flood', label: 'Coastal / Storm Surge', icon: 'boat',         color: colors.floodHazard.coastalFlood },
  { key: 'urban_flood',   label: 'Urban Flood',           icon: 'business',     color: colors.floodHazard.urbanFlood },
];

const ROAD_TYPES: HazardTypeDef[] = [
  { key: 'closed_road', label: 'Road Closed',         icon: 'close-circle', color: colors.roadHazard.closedRoad },
  { key: 'debris',      label: 'Debris / Obstruction', icon: 'warning',      color: colors.roadHazard.debris },
  { key: 'landslide',   label: 'Landslide',           icon: 'earth',        color: colors.roadHazard.landslide },
  { key: 'flooded_road', label: 'Flooded Road',        icon: 'car',          color: colors.roadHazard.impassable },
  { key: 'slow_zone',   label: 'Slow Down Zone',      icon: 'speedometer',  color: colors.roadHazard.slowDown },
];

const CATEGORY_META: Record<HazardCategoryType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; gradient: [string, string]; types: HazardTypeDef[] }> = {
  flood: { label: 'Flood Hazards', icon: 'water',  color: colors.brand[500],           gradient: [colors.brand[500], '#0277BD'],                              types: FLOOD_TYPES },
  road:  { label: 'Road Hazards',  icon: 'car',    color: colors.roadHazard.closedRoad, gradient: [colors.roadHazard.debris, colors.roadHazard.closedRoad], types: ROAD_TYPES },
};

const SEVERITIES: { key: Severity; label: string; color: string }[] = [
  { key: 'low',      label: 'Low',      color: colors.severity.low },
  { key: 'moderate', label: 'Moderate', color: colors.severity.moderate },
  { key: 'high',     label: 'High',     color: colors.severity.high },
  { key: 'critical', label: 'Critical', color: colors.severity.critical },
];

function findTypeDef(category: HazardCategoryType, type: string): HazardTypeDef | undefined {
  return CATEGORY_META[category].types.find(t => t.key === type);
}

/* ───────────────────── main screen ───────────────────── */

export default function HazardManagement() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const { token } = useAuth();

  const [hazards, setHazards]       = useState<Hazard[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editTarget, setEditTarget]   = useState<Hazard | null>(null);
  const [filterCat, setFilterCat]     = useState<HazardCategoryType | 'all'>('all');

  const bg          = isDark ? colors.dark.bg      : '#F2F4F7';
  const cardBg      = isDark ? colors.dark.card    : colors.white;
  const cardBorder  = isDark ? colors.dark.border  : '#E8ECF0';
  const textPrimary = isDark ? colors.white        : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[500];

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      const data = await getHazards(token);
      setHazards(data);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterCat === 'all' ? hazards : hazards.filter(h => h.category === filterCat);

  function handleEdit(hazard: Hazard) {
    setEditTarget(hazard);
    setFormVisible(true);
  }

  function handleCreate() {
    setEditTarget(null);
    setFormVisible(true);
  }

  async function handleToggleActive(hazard: Hazard) {
    if (!token) return;
    try {
      const updated = await updateHazard(hazard.id, { active: !hazard.active }, token);
      setHazards(prev => prev.map(h => h.id === hazard.id ? updated : h));
    } catch {}
  }

  async function handleDelete(hazard: Hazard) {
    Alert.alert(
      'Delete Hazard',
      `Remove "${hazard.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await deleteHazard(hazard.id, token);
              setHazards(prev => prev.filter(h => h.id !== hazard.id));
            } catch {}
          },
        },
      ],
    );
  }

  async function handleFormSave(payload: HazardPayload) {
    if (!token) return;
    try {
      if (editTarget) {
        const updated = await updateHazard(editTarget.id, payload, token);
        setHazards(prev => prev.map(h => h.id === editTarget.id ? updated : h));
      } else {
        const created = await createHazard(payload, token);
        setHazards(prev => [created, ...prev]);
      }
      setFormVisible(false);
      setEditTarget(null);
    } catch {}
  }

  if (loading) {
    return (
      <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={$.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      </View>
    );
  }

  const activeCount = hazards.filter(h => h.active).length;
  const floodCount  = hazards.filter(h => h.category === 'flood').length;
  const roadCount   = hazards.filter(h => h.category === 'road').length;

  return (
    <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.accent[500]}
            colors={[colors.accent[500]]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={$.header}>
          <View style={$.headerLeft}>
            <Pressable onPress={() => router.back()} style={[$.backBtn, { borderColor: cardBorder }]}>
              <Ionicons name="arrow-back" size={18} color={textPrimary} />
            </Pressable>
            <View>
              <Text style={[$.headerTitle, { color: textPrimary }]}>Hazard Management</Text>
              <Text style={[$.headerSub, { color: textSecondary }]}>{hazards.length} hazards · {activeCount} active</Text>
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View style={$.statsRow}>
          <View style={[$.statPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Ionicons name="water" size={14} color={colors.brand[500]} />
            <Text style={[$.statNum, { color: textPrimary }]}>{floodCount}</Text>
            <Text style={[$.statLbl, { color: textSecondary }]}>Flood</Text>
          </View>
          <View style={[$.statPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Ionicons name="car" size={14} color={colors.roadHazard.closedRoad} />
            <Text style={[$.statNum, { color: textPrimary }]}>{roadCount}</Text>
            <Text style={[$.statLbl, { color: textSecondary }]}>Road</Text>
          </View>
          <View style={[$.statPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.severity.low} />
            <Text style={[$.statNum, { color: textPrimary }]}>{activeCount}</Text>
            <Text style={[$.statLbl, { color: textSecondary }]}>Active</Text>
          </View>
        </View>

        {/* Filter chips */}
        <View style={$.filterRow}>
          {([
            { key: 'all' as const, label: 'All', icon: 'grid' as const, color: colors.brand[500] },
            { key: 'flood' as const, label: 'Flood', icon: 'water' as const, color: colors.brand[500] },
            { key: 'road' as const, label: 'Road', icon: 'car' as const, color: colors.roadHazard.closedRoad },
          ]).map(f => {
            const active = filterCat === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilterCat(f.key)}
                style={[
                  $.filterChip,
                  { backgroundColor: active ? f.color : cardBg, borderColor: active ? f.color : cardBorder },
                ]}
              >
                <Ionicons name={f.icon} size={12} color={active ? '#fff' : textSecondary} />
                <Text style={[$.filterLabel, { color: active ? '#fff' : textPrimary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Hazard list */}
        {filtered.length === 0 ? (
          <View style={$.emptyState}>
            <Ionicons name="alert-circle-outline" size={40} color={textSecondary} />
            <Text style={[$.emptyText, { color: textSecondary }]}>No hazards found</Text>
            <Text style={[$.emptySubtext, { color: textSecondary }]}>Tap + to create one</Text>
          </View>
        ) : (
          filtered.map(hazard => {
            const typeDef = findTypeDef(hazard.category, hazard.type);
            const catMeta = CATEGORY_META[hazard.category];
            return (
              <Pressable
                key={hazard.id}
                style={[$.hazardCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
                onPress={() => handleEdit(hazard)}
              >
                <View style={$.hazardCardTop}>
                  <View style={[$.hazardIcon, { backgroundColor: (typeDef?.color ?? catMeta.color) + '18' }]}>
                    <Ionicons name={typeDef?.icon ?? catMeta.icon} size={18} color={typeDef?.color ?? catMeta.color} />
                  </View>
                  <View style={$.hazardInfo}>
                    <Text style={[$.hazardTitle, { color: textPrimary }]} numberOfLines={1}>{hazard.title}</Text>
                    <Text style={[$.hazardType, { color: textSecondary }]}>
                      {catMeta.label} · {typeDef?.label ?? hazard.type}
                    </Text>
                    {hazard.address ? (
                      <View style={$.hazardAddrRow}>
                        <Ionicons name="location-outline" size={10} color={textSecondary} />
                        <Text style={[$.hazardAddr, { color: textSecondary }]} numberOfLines={1}>{hazard.address}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={$.hazardActions}>
                    <View style={[$.sevBadge, { backgroundColor: colors.severity[hazard.severity] + '20' }]}>
                      <Text style={[$.sevBadgeText, { color: colors.severity[hazard.severity] }]}>
                        {hazard.severity}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={[$.hazardCardBottom, { borderTopColor: cardBorder }]}>
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); handleToggleActive(hazard); }}
                    style={$.hazardActionBtn}
                    hitSlop={6}
                  >
                    <View style={[$.miniToggle, { backgroundColor: hazard.active ? colors.severity.low : colors.slate[300] }]}>
                      <View style={[$.miniToggleKnob, hazard.active ? $.miniToggleOn : $.miniToggleOff]} />
                    </View>
                    <Text style={[$.actionLabel, { color: hazard.active ? colors.severity.low : textSecondary }]}>
                      {hazard.active ? 'Active' : 'Inactive'}
                    </Text>
                  </Pressable>

                  <Text style={[$.hazardTime, { color: textSecondary }]}>{hazard.createdAt}</Text>

                  <Pressable
                    onPress={(e) => { e.stopPropagation(); handleDelete(hazard); }}
                    style={$.hazardActionBtn}
                    hitSlop={6}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.severity.critical} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [$.fab, pressed && { transform: [{ scale: 0.92 }] }]}
        onPress={handleCreate}
      >
        <LinearGradient
          colors={[colors.brand[500], colors.accent[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={$.fabGradient}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </Pressable>

      {/* Form modal */}
      <HazardFormModal
        visible={formVisible}
        onClose={() => { setFormVisible(false); setEditTarget(null); }}
        onSave={handleFormSave}
        editTarget={editTarget}
        isDark={isDark}
      />
    </View>
  );
}

/* ───────────────────── form modal ───────────────────── */

function HazardFormModal({
  visible,
  onClose,
  onSave,
  editTarget,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (p: HazardPayload) => Promise<void>;
  editTarget: Hazard | null;
  isDark: boolean;
}) {
  const insets   = useSafeAreaInsets();
  const mapRef   = useRef<MapView>(null);

  const [category, setCategory]       = useState<HazardCategoryType>('flood');
  const [hazardType, setHazardType]   = useState('');
  const [severity, setSeverity]       = useState<Severity>('moderate');
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress]         = useState('');
  const [pickedCoord, setPickedCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapReady, setMapReady]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [step, setStep]               = useState<'form' | 'map'>('form');

  const bg          = isDark ? colors.dark.bg      : '#F2F4F7';
  const cardBg      = isDark ? colors.dark.card    : colors.white;
  const cardBorder  = isDark ? colors.dark.border  : '#E8ECF0';
  const textPrimary = isDark ? colors.white        : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[500];
  const inputBg     = isDark ? colors.dark.surface : colors.slate[50];

  // Reset form when opening
  useEffect(() => {
    if (visible) {
      if (editTarget) {
        setCategory(editTarget.category);
        setHazardType(editTarget.type);
        setSeverity(editTarget.severity);
        setTitle(editTarget.title);
        setDescription(editTarget.description);
        setAddress(editTarget.address);
        setPickedCoord({ latitude: editTarget.latitude, longitude: editTarget.longitude });
      } else {
        setCategory('flood');
        setHazardType('');
        setSeverity('moderate');
        setTitle('');
        setDescription('');
        setAddress('');
        setPickedCoord(null);
      }
      setStep('form');
      setMapReady(false);
    }
  }, [visible, editTarget]);

  // Auto-set title from type selection
  useEffect(() => {
    if (!editTarget && hazardType) {
      const typeDef = CATEGORY_META[category].types.find(t => t.key === hazardType);
      if (typeDef) setTitle(typeDef.label);
    }
  }, [hazardType, category, editTarget]);

  const canSave = hazardType && title.trim() && pickedCoord;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({
        category,
        type: hazardType,
        severity,
        title: title.trim(),
        description: description.trim(),
        latitude: pickedCoord!.latitude,
        longitude: pickedCoord!.longitude,
        address: address.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  function handleMapPress(e: any) {
    const coord = e.nativeEvent.coordinate;
    if (coord) {
      setPickedCoord({ latitude: coord.latitude, longitude: coord.longitude });
    }
  }

  const currentTypes = CATEGORY_META[category].types;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[$.modalRoot, { backgroundColor: bg, paddingTop: Platform.OS === 'ios' ? 10 : insets.top }]}>
          {/* Modal header */}
          <View style={$.modalHeader}>
            <Pressable onPress={step === 'map' ? () => setStep('form') : onClose} hitSlop={8}>
              <Ionicons name={step === 'map' ? 'arrow-back' : 'close'} size={22} color={textPrimary} />
            </Pressable>
            <Text style={[$.modalTitle, { color: textPrimary }]}>
              {step === 'map' ? 'Pick Location' : editTarget ? 'Edit Hazard' : 'New Hazard'}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {step === 'form' ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[$.formContent, { paddingBottom: insets.bottom + 20 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Category selector */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Category</Text>
              <View style={$.catRow}>
                {(['flood', 'road'] as const).map(cat => {
                  const meta = CATEGORY_META[cat];
                  const active = category === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => { setCategory(cat); setHazardType(''); }}
                      style={[
                        $.catCard,
                        { backgroundColor: active ? meta.color + '15' : cardBg, borderColor: active ? meta.color : cardBorder },
                      ]}
                    >
                      <LinearGradient
                        colors={meta.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[$.catCardIcon, !active && { opacity: 0.4 }]}
                      >
                        <Ionicons name={meta.icon} size={18} color="#fff" />
                      </LinearGradient>
                      <Text style={[$.catCardLabel, { color: active ? meta.color : textSecondary }]}>{meta.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Hazard type */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Hazard Type</Text>
              <View style={$.typeGrid}>
                {currentTypes.map(t => {
                  const active = hazardType === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setHazardType(t.key)}
                      style={[
                        $.typeChip,
                        { backgroundColor: active ? t.color + '15' : cardBg, borderColor: active ? t.color : cardBorder },
                      ]}
                    >
                      <Ionicons name={t.icon} size={14} color={active ? t.color : textSecondary} />
                      <Text style={[$.typeLabel, { color: active ? t.color : textPrimary }]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Severity */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Severity</Text>
              <View style={$.sevRow}>
                {SEVERITIES.map(s => {
                  const active = severity === s.key;
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => setSeverity(s.key)}
                      style={[
                        $.sevChip,
                        { backgroundColor: active ? s.color + '18' : cardBg, borderColor: active ? s.color : cardBorder },
                      ]}
                    >
                      <View style={[$.sevDot, { backgroundColor: s.color }]} />
                      <Text style={[$.sevChipLabel, { color: active ? s.color : textPrimary }]}>{s.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Title */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Title</Text>
              <TextInput
                style={[$.input, { backgroundColor: inputBg, color: textPrimary, borderColor: cardBorder }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Hazard title"
                placeholderTextColor={textSecondary}
              />

              {/* Description */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Description</Text>
              <TextInput
                style={[$.input, $.inputMulti, { backgroundColor: inputBg, color: textPrimary, borderColor: cardBorder }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description..."
                placeholderTextColor={textSecondary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Address */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Address</Text>
              <TextInput
                style={[$.input, { backgroundColor: inputBg, color: textPrimary, borderColor: cardBorder }]}
                value={address}
                onChangeText={setAddress}
                placeholder="Street address or landmark"
                placeholderTextColor={textSecondary}
              />

              {/* Location picker */}
              <Text style={[$.fieldLabel, { color: textPrimary }]}>Location</Text>
              <Pressable
                onPress={() => setStep('map')}
                style={[$.locationBtn, { backgroundColor: cardBg, borderColor: pickedCoord ? colors.severity.low : cardBorder }]}
              >
                <Ionicons
                  name={pickedCoord ? 'checkmark-circle' : 'location'}
                  size={18}
                  color={pickedCoord ? colors.severity.low : colors.brand[500]}
                />
                <Text style={[$.locationBtnText, { color: pickedCoord ? colors.severity.low : textPrimary }]}>
                  {pickedCoord
                    ? `${pickedCoord.latitude.toFixed(5)}, ${pickedCoord.longitude.toFixed(5)}`
                    : 'Tap to pick on map'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={textSecondary} />
              </Pressable>

              {/* Save */}
              <Pressable
                onPress={handleSave}
                disabled={!canSave || saving}
                style={({ pressed }) => [$.saveBtn, (!canSave || saving) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
              >
                <LinearGradient
                  colors={canSave ? [colors.brand[500], colors.accent[500]] : [colors.slate[400], colors.slate[400]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={$.saveBtnGrad}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={editTarget ? 'checkmark' : 'add-circle'} size={18} color="#fff" />
                      <Text style={$.saveBtnText}>{editTarget ? 'Save Changes' : 'Create Hazard'}</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </ScrollView>
          ) : (
            /* ── MAP PICKER ── */
            <View style={{ flex: 1 }}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                provider={PROVIDER_GOOGLE}
                initialRegion={
                  pickedCoord
                    ? { ...pickedCoord, latitudeDelta: 0.01, longitudeDelta: 0.01 }
                    : INITIAL_REGION
                }
                onMapReady={() => setMapReady(true)}
                onPress={handleMapPress}
                showsUserLocation
                showsMyLocationButton={false}
              >
                {pickedCoord && (
                  <Marker
                    coordinate={pickedCoord}
                    draggable
                    onDragEnd={(e: any) => {
                      const c = e.nativeEvent.coordinate;
                      if (c) setPickedCoord({ latitude: c.latitude, longitude: c.longitude });
                    }}
                  >
                    <View style={$.mapPin}>
                      <Ionicons
                        name={findTypeDef(category, hazardType)?.icon ?? CATEGORY_META[category].icon}
                        size={18}
                        color="#fff"
                      />
                    </View>
                    <View style={$.mapPinTail} />
                  </Marker>
                )}
              </MapView>

              {/* Instruction overlay */}
              <View style={[$.mapInstruction, { backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)' }]}>
                <Ionicons name="finger-print" size={16} color={colors.brand[500]} />
                <Text style={[$.mapInstructionText, { color: textPrimary }]}>
                  Tap on the map to place the hazard. Drag the pin to adjust.
                </Text>
              </View>

              {/* Confirm button */}
              {pickedCoord && (
                <View style={[$.mapBottomBar, { paddingBottom: insets.bottom + 12 }]}>
                  <View style={[$.mapCoordPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <Ionicons name="location" size={12} color={colors.severity.low} />
                    <Text style={[$.mapCoordText, { color: textPrimary }]}>
                      {pickedCoord.latitude.toFixed(5)}, {pickedCoord.longitude.toFixed(5)}
                    </Text>
                  </View>
                  <Pressable onPress={() => setStep('form')} style={$.mapConfirmBtn}>
                    <LinearGradient
                      colors={[colors.brand[500], colors.accent[500]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={$.mapConfirmGrad}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={$.mapConfirmText}>Confirm Location</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ───────────────────── styles ───────────────────── */

const $ = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },

  /* stats */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 10, fontWeight: '600' },

  /* filters */
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 12, fontWeight: '700' },

  /* empty */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: '700' },
  emptySubtext: { fontSize: 12, fontWeight: '500' },

  /* hazard cards */
  hazardCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  hazardCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  hazardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardInfo: { flex: 1, gap: 2 },
  hazardTitle: { fontSize: 14, fontWeight: '700' },
  hazardType: { fontSize: 11, fontWeight: '500' },
  hazardAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  hazardAddr: { fontSize: 10, fontWeight: '500', flex: 1 },
  hazardActions: { alignItems: 'flex-end', gap: 6 },
  sevBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sevBadgeText: { fontSize: 9, fontWeight: '800', textTransform: 'capitalize' },
  hazardCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  hazardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionLabel: { fontSize: 11, fontWeight: '600' },
  hazardTime: { fontSize: 10, fontWeight: '500' },

  /* mini toggle */
  miniToggle: {
    width: 28,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  miniToggleKnob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  miniToggleOn: { alignSelf: 'flex-end' as const },
  miniToggleOff: { alignSelf: 'flex-start' as const },

  /* FAB */
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── modal form ── */
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  formContent: { paddingHorizontal: 20, gap: 4 },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 6,
  },

  /* category */
  catRow: { flexDirection: 'row', gap: 10 },
  catCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
  },
  catCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catCardLabel: { fontSize: 12, fontWeight: '700' },

  /* type grid */
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  typeLabel: { fontSize: 12, fontWeight: '600' },

  /* severity */
  sevRow: { flexDirection: 'row', gap: 6 },
  sevChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  sevChipLabel: { fontSize: 11, fontWeight: '700' },

  /* inputs */
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  inputMulti: {
    minHeight: 80,
    paddingTop: 12,
  },

  /* location */
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  locationBtnText: { flex: 1, fontSize: 13, fontWeight: '600' },

  /* save button */
  saveBtn: { marginTop: 20 },
  saveBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  /* ── map picker ── */
  mapPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  mapPinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.brand[500],
    alignSelf: 'center',
    marginTop: -2,
  },
  mapInstruction: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapInstructionText: { flex: 1, fontSize: 12, fontWeight: '600' },
  mapBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    alignItems: 'center',
  },
  mapCoordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  mapCoordText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mapConfirmBtn: { width: '100%' },
  mapConfirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  mapConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
