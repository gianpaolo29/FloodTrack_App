/**
 * Profile screen — premium redesign v2
 * Gradient hero · glassmorphic modals · animated stat cards · stagger entrance
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Storage from '@/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { updateProfile, changePassword } from '@/services/api';

// ─── Row icon colors per key ──────────────────────────────────────────────────

const ICON_COLORS: Record<string, string> = {
  'person-outline':             '#4F8EF7',
  'lock-closed-outline':        '#A855F7',
  'call-outline':               '#10B981',
  'call':                       '#10B981',
  'alert-circle-outline':       colors.severity.critical,
  'information-circle-outline': '#F59E0B',
  'document-text-outline':      colors.brand[500],
  'shield-outline':             '#6366F1',
  'help-circle-outline':        '#0EA5E9',
  'information-outline':        colors.slate[400],
  'log-out-outline':            colors.severity.critical,
};

// ─── Setting row ──────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  label,
  description,
  right,
  onPress,
  isDark,
  destructive = false,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  isDark: boolean;
  destructive?: boolean;
  isLast?: boolean;
}) {
  const accentColor = destructive
    ? colors.severity.critical
    : ICON_COLORS[icon] ?? colors.brand[500];

  const labelColor = destructive
    ? colors.severity.critical
    : isDark ? colors.white : colors.slate[800];

  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          isDark && { backgroundColor: colors.dark.card },
          pressed && onPress && {
            backgroundColor: isDark ? colors.dark.elevated : '#F0F4FF',
          },
        ]}
        accessibilityRole={onPress ? 'button' : 'none'}
        accessibilityLabel={label}
      >
        {/* Tinted icon tile */}
        <View style={[styles.rowIcon, { backgroundColor: accentColor + '20' }]}>
          <Ionicons name={icon} size={17} color={accentColor} />
        </View>

        {/* Text */}
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
          {description && (
            <Text style={[styles.rowDesc, isDark && { color: colors.slate[500] }]}>
              {description}
            </Text>
          )}
        </View>

        {/* Right slot */}
        {right !== undefined
          ? right
          : onPress && !destructive
          ? <Ionicons name="chevron-forward" size={15} color={colors.slate[400]} />
          : null}
      </Pressable>

      {!isLast && (
        <View style={[styles.sep, isDark && { backgroundColor: colors.slate[800] }]} />
      )}
    </>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <Text style={[styles.sectionLabel, isDark && { color: colors.slate[500] }]}>
      {title}
    </Text>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  icon,
  color,
  isDark,
  animValue,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isDark: boolean;
  animValue: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        styles.statTile,
        isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
        {
          opacity: animValue,
          transform: [{
            translateY: animValue.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          }],
        },
      ]}
    >
      {/* Subtle gradient background */}
      <LinearGradient
        colors={isDark
          ? [color + '12', color + '06']
          : [color + '14', color + '06']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.statValue, isDark && { color: colors.white }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, isDark && { color: colors.slate[500] }]}>{label}</Text>
    </Animated.View>
  );
}

// ─── Glassmorphic input field ─────────────────────────────────────────────────

function GlassInput({
  icon,
  isDark,
  children,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  isDark: boolean;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        styles.glassField,
        isDark
          ? { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }
          : { backgroundColor: 'rgba(255,255,255,0.85)', borderColor: 'rgba(79,142,247,0.18)' },
        style,
      ]}
    >
      {icon && (
        <Ionicons name={icon} size={16} color={isDark ? 'rgba(255,255,255,0.45)' : colors.slate[400]} style={{ marginRight: 2 }} />
      )}
      {children}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user, token, logout, login } = useAuth();
  const { showAlert } = useAlert();

  const [notifCritical,    setNotifCritical]    = useState(true);
  const [notifAdvisory,    setNotifAdvisory]    = useState(true);
  const [notifMyReports,   setNotifMyReports]   = useState(true);
  const [emergencyName,    setEmergencyName]    = useState('');
  const [emergencyPhone,   setEmergencyPhone]   = useState('');
  const [editingEmergency, setEditingEmergency] = useState(false);
  const [tempName,         setTempName]         = useState('');
  const [tempPhone,        setTempPhone]        = useState('');

  // Edit profile modal state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editFirstName, setEditFirstName]     = useState('');
  const [editLastName, setEditLastName]       = useState('');
  const [editContact, setEditContact]         = useState('');
  const [editSaving, setEditSaving]           = useState(false);

  // Change password modal state
  const [showChangePwd, setShowChangePwd]         = useState(false);
  const [currentPwd, setCurrentPwd]               = useState('');
  const [newPwd, setNewPwd]                       = useState('');
  const [confirmPwd, setConfirmPwd]               = useState('');
  const [pwdSaving, setPwdSaving]                 = useState(false);
  const [showCurrentPwd, setShowCurrentPwd]       = useState(false);
  const [showNewPwd, setShowNewPwd]               = useState(false);

  // ── Entrance animations ──
  const heroAnim   = useRef(new Animated.Value(0)).current;
  const stat0Anim  = useRef(new Animated.Value(0)).current;
  const stat1Anim  = useRef(new Animated.Value(0)).current;
  const stat2Anim  = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.timing(heroAnim, {
        toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(stat0Anim, {
        toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true,
      }),
      Animated.timing(stat1Anim, {
        toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true,
      }),
      Animated.timing(stat2Anim, {
        toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function openEditProfile() {
    setEditFirstName(user?.firstName ?? '');
    setEditLastName(user?.lastName ?? '');
    setEditContact(user?.contact ?? '');
    setShowEditProfile(true);
  }

  async function handleSaveProfile() {
    if (!editFirstName.trim() || !editLastName.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'Name fields cannot be empty.' });
      return;
    }
    setEditSaving(true);
    try {
      await updateProfile({
        name: `${editFirstName.trim()} ${editLastName.trim()}`,
        contact_number: editContact.trim() || undefined,
      }, token!);
      showAlert({ type: 'success', title: 'Updated', message: 'Your profile has been updated. Changes will reflect on next login.' });
      setShowEditProfile(false);
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Failed', message: e?.message ?? 'Could not update profile.' });
    } finally {
      setEditSaving(false);
    }
  }

  function openChangePwd() {
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setShowChangePwd(true);
  }

  async function handleChangePwd() {
    if (!currentPwd) {
      showAlert({ type: 'error', title: 'Error', message: 'Enter your current password.' });
      return;
    }
    if (newPwd.length < 8) {
      showAlert({ type: 'error', title: 'Error', message: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPwd !== confirmPwd) {
      showAlert({ type: 'error', title: 'Error', message: 'Passwords do not match.' });
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword({
        current_password: currentPwd,
        password: newPwd,
        password_confirmation: confirmPwd,
      }, token!);
      showAlert({ type: 'success', title: 'Done', message: 'Your password has been changed.' });
      setShowChangePwd(false);
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Failed', message: e?.message ?? 'Could not change password. Check your current password.' });
    } finally {
      setPwdSaving(false);
    }
  }

  // Load persisted preferences
  useEffect(() => {
    Promise.all([
      Storage.getItem('ft_emergency_name'),
      Storage.getItem('ft_emergency_phone'),
      Storage.getItem('ft_notif_critical'),
      Storage.getItem('ft_notif_advisory'),
      Storage.getItem('ft_notif_reports'),
    ]).then(([name, phone, nc, na, nr]) => {
      if (name)  setEmergencyName(name);
      if (phone) setEmergencyPhone(phone);
      if (nc !== null) setNotifCritical(nc !== 'false');
      if (na !== null) setNotifAdvisory(na !== 'false');
      if (nr !== null) setNotifMyReports(nr !== 'false');
    }).catch(() => {});
  }, []);

  // Persist notification preferences on change
  useEffect(() => { Storage.setItem('ft_notif_critical', String(notifCritical)); }, [notifCritical]);
  useEffect(() => { Storage.setItem('ft_notif_advisory', String(notifAdvisory)); }, [notifAdvisory]);
  useEffect(() => { Storage.setItem('ft_notif_reports',  String(notifMyReports)); }, [notifMyReports]);

  function saveEmergencyContact() {
    Promise.all([
      Storage.setItem('ft_emergency_name',  tempName),
      Storage.setItem('ft_emergency_phone', tempPhone),
    ]).catch(() => {});
    setEmergencyName(tempName);
    setEmergencyPhone(tempPhone);
    setEditingEmergency(false);
  }

  const screenBg    = isDark ? colors.dark.bg : '#F0F4FA';
  const roleColor   = user?.role === 'Responder' ? colors.accent[500] : '#A5C8FF';
  const accentBrand = user?.role === 'Responder' ? colors.accent[500] : colors.brand[500];

  const fullName   = user ? `${user.firstName} ${user.lastName}` : '—';
  const initials   = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : '?';
  const joinedYear = user
    ? new Date(user.joinedAt).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    : '—';

  const switchTrack = { true: accentBrand, false: isDark ? colors.slate[700] : colors.slate[200] };

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero header with gradient ── */}
        <Animated.View
          style={{
            opacity: heroAnim,
            transform: [{
              translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }),
            }],
          }}
        >
          <LinearGradient
            colors={['#00D2FF', '#4A6CF7', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 20 }]}
          >
            {/* Decorative orbs */}
            <View style={styles.orb1} />
            <View style={styles.orb2} />
            <View style={styles.orb3} />

            {/* Edit shortcut */}
            <Pressable style={styles.editBtn} onPress={openEditProfile} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Ionicons name="pencil" size={15} color="rgba(255,255,255,0.92)" />
            </Pressable>

            {/* Avatar ring */}
            <View style={styles.avatarRing}>
              <View style={[styles.avatarRingInner, { borderColor: roleColor }]}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.10)']}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              </View>
            </View>

            <Text style={styles.heroName}>{fullName}</Text>
            <Text style={styles.heroEmail}>{user?.email ?? '—'}</Text>

            {/* Role badge */}
            <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)' }]}>
              <Ionicons
                name={user?.role === 'Responder' ? 'shield-checkmark' : 'person-circle'}
                size={11}
                color={colors.white}
              />
              <Text style={[styles.roleBadgeText, { color: colors.white }]}>
                {user?.role ?? 'Resident'}
              </Text>
            </View>

            {/* Wave transition */}
            <View style={styles.waveContainer} pointerEvents="none">
              <View style={[styles.waveBack, { backgroundColor: screenBg, opacity: 0.35 }]} />
              <View style={[styles.waveFront, { backgroundColor: screenBg }]} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Stat cards ── */}
        <View style={styles.statsRow}>
          <StatTile
            value={user?.role ?? '—'}
            label="Role"
            icon="shield-outline"
            color={accentBrand}
            isDark={isDark}
            animValue={stat0Anim}
          />
          <StatTile
            value={user?.contact ?? '—'}
            label="Mobile"
            icon="call-outline"
            color="#10B981"
            isDark={isDark}
            animValue={stat1Anim}
          />
          <StatTile
            value={joinedYear}
            label="Member since"
            icon="calendar-outline"
            color="#A855F7"
            isDark={isDark}
            animValue={stat2Anim}
          />
        </View>

        {/* ── Content ── */}
        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentAnim,
              transform: [{
                translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
              }],
            },
          ]}
        >

          {/* ── Account ── */}
          <SectionLabel title="Account" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
            <SettingRow
              icon="person-outline"
              label="Edit profile"
              description="Name, contact number"
              onPress={openEditProfile}
              isDark={isDark}
            />
            <SettingRow
              icon="lock-closed-outline"
              label="Change password"
              onPress={openChangePwd}
              isDark={isDark}
            />
            <SettingRow icon="call-outline" label="Mobile number" description={user?.contact ?? '—'} isDark={isDark} isLast />
          </View>

          {/* ── Notifications ── */}
          <SectionLabel title="Notifications" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
            <SettingRow
              icon="alert-circle-outline"
              label="Critical alerts"
              description="Life-threatening incidents near you"
              isDark={isDark}
              right={
                <Switch
                  value={notifCritical}
                  onValueChange={setNotifCritical}
                  trackColor={switchTrack}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.slate[200]}
                  accessibilityLabel="Toggle critical alerts"
                />
              }
            />
            <SettingRow
              icon="information-circle-outline"
              label="Advisories"
              description="Weather and safety advisories"
              isDark={isDark}
              right={
                <Switch
                  value={notifAdvisory}
                  onValueChange={setNotifAdvisory}
                  trackColor={switchTrack}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.slate[200]}
                  accessibilityLabel="Toggle advisories"
                />
              }
            />
            <SettingRow
              icon="document-text-outline"
              label="My report updates"
              description="Status changes on your submissions"
              isDark={isDark}
              isLast
              right={
                <Switch
                  value={notifMyReports}
                  onValueChange={setNotifMyReports}
                  trackColor={switchTrack}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.slate[200]}
                  accessibilityLabel="Toggle report update notifications"
                />
              }
            />
          </View>

          {/* ── Emergency contact ── */}
          <SectionLabel title="Emergency Contact" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
            {editingEmergency ? (
              <>
                <View style={[styles.emergencyInputRow, isDark && { backgroundColor: colors.dark.card }]}>
                  <Ionicons name="person-outline" size={16} color={colors.slate[400]} />
                  <TextInput
                    style={[styles.emergencyInput, isDark && { color: colors.white }]}
                    value={tempName}
                    onChangeText={setTempName}
                    placeholder="Contact name"
                    placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
                    autoFocus
                  />
                </View>
                <View style={[styles.sep, isDark && { backgroundColor: colors.slate[800] }]} />
                <View style={[styles.emergencyInputRow, isDark && { backgroundColor: colors.dark.card }]}>
                  <Ionicons name="call-outline" size={16} color={colors.slate[400]} />
                  <TextInput
                    style={[styles.emergencyInput, isDark && { color: colors.white }]}
                    value={tempPhone}
                    onChangeText={setTempPhone}
                    placeholder="Phone number"
                    placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={[styles.sep, isDark && { backgroundColor: colors.slate[800] }]} />
                <View style={styles.emergencyActions}>
                  <Pressable
                    style={[styles.emergencyCancelBtn, isDark && { borderColor: colors.slate[700] }]}
                    onPress={() => setEditingEmergency(false)}
                  >
                    <Text style={[styles.emergencyCancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.emergencySaveBtn} onPress={saveEmergencyContact}>
                    <LinearGradient
                      colors={['#4A6CF7', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.emergencySaveBtnGrad}
                    >
                      <Text style={styles.emergencySaveText}>Save</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <SettingRow
                  icon="call-outline"
                  label={emergencyName || 'Set emergency contact'}
                  description={emergencyPhone || 'Tap to add someone to call in emergencies'}
                  onPress={() => {
                    setTempName(emergencyName);
                    setTempPhone(emergencyPhone);
                    setEditingEmergency(true);
                  }}
                  isDark={isDark}
                  isLast={!emergencyPhone}
                />
                {!!emergencyPhone && (
                  <SettingRow
                    icon="call"
                    label="Call now"
                    description={emergencyPhone}
                    onPress={() => Linking.openURL(`tel:${emergencyPhone}`)}
                    isDark={isDark}
                    isLast
                  />
                )}
              </>
            )}
          </View>

          {/* ── About ── */}
          <SectionLabel title="About" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
            <SettingRow
              icon="shield-outline"
              label="Privacy policy"
              onPress={() => showAlert({ type: 'info', title: 'Privacy Policy', message: 'Your data is securely stored and never shared with third parties.' })}
              isDark={isDark}
            />
            <SettingRow
              icon="help-circle-outline"
              label="Help & support"
              onPress={() => showAlert({ type: 'info', title: 'Help & Support', message: 'For assistance, contact your local DRRM office or email support@floodtrack.ph.' })}
              isDark={isDark}
            />
            <SettingRow icon="information-outline" label="App version" description="1.0.0" isDark={isDark} isLast />
          </View>

          {/* ── Log out ── */}
          <Pressable
            onPress={() => showAlert({
              type: 'confirm',
              title: 'Log out?',
              message: 'You will need to sign in again to access your account.',
              confirmText: 'Log out',
              cancelText: 'Cancel',
              onConfirm: logout,
            })}
            style={({ pressed }) => [
              styles.logoutBtn,
              isDark && { backgroundColor: colors.severity.critical + '12', borderColor: colors.severity.critical + '30' },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <View style={styles.logoutIcon}>
              <Ionicons name="log-out-outline" size={18} color={colors.severity.critical} />
            </View>
            <Text style={styles.logoutText}>Log out</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.severity.critical + '88'} />
          </Pressable>

        </Animated.View>
      </ScrollView>

      {/* ═══════ Edit Profile Modal ═══════ */}
      <Modal visible={showEditProfile} transparent animationType="slide" onRequestClose={() => setShowEditProfile(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && { backgroundColor: colors.dark.elevated }]}>
            {/* Gradient header bar */}
            <LinearGradient
              colors={['#4A6CF7', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalGradHeader}
            >
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalHeaderIcon}>
                  <Ionicons name="person-outline" size={18} color={colors.white} />
                </View>
                <Text style={styles.modalHeaderTitle}>Edit Profile</Text>
              </View>
            </LinearGradient>

            <View style={styles.modalBody}>
              <View style={styles.modalFields}>
                <View style={styles.modalFieldRow}>
                  <GlassInput icon="person-outline" isDark={isDark} style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.modalInput, isDark && { color: colors.white }]}
                      value={editFirstName}
                      onChangeText={setEditFirstName}
                      placeholder="First name"
                      placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                      autoCapitalize="words"
                    />
                  </GlassInput>
                  <GlassInput icon="person-outline" isDark={isDark} style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.modalInput, isDark && { color: colors.white }]}
                      value={editLastName}
                      onChangeText={setEditLastName}
                      placeholder="Last name"
                      placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                      autoCapitalize="words"
                    />
                  </GlassInput>
                </View>
                <GlassInput icon="call-outline" isDark={isDark}>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={editContact}
                    onChangeText={setEditContact}
                    placeholder="Contact number"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    keyboardType="phone-pad"
                  />
                </GlassInput>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn, isDark && { borderColor: colors.dark.border }]}
                  onPress={() => setShowEditProfile(false)}
                >
                  <Text style={[styles.modalCancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalSaveBtn} onPress={handleSaveProfile} disabled={editSaving}>
                  <LinearGradient
                    colors={['#4A6CF7', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalSaveBtnGrad}
                  >
                    {editSaving
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={styles.modalSaveText}>Save Changes</Text>
                    }
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════ Change Password Modal ═══════ */}
      <Modal visible={showChangePwd} transparent animationType="slide" onRequestClose={() => setShowChangePwd(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && { backgroundColor: colors.dark.elevated }]}>
            {/* Gradient header bar */}
            <LinearGradient
              colors={['#A855F7', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalGradHeader}
            >
              <View style={styles.modalHandle} />
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalHeaderIcon}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.white} />
                </View>
                <Text style={styles.modalHeaderTitle}>Change Password</Text>
              </View>
            </LinearGradient>

            <View style={styles.modalBody}>
              <View style={styles.modalFields}>
                <GlassInput icon="lock-closed-outline" isDark={isDark}>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={currentPwd}
                    onChangeText={setCurrentPwd}
                    placeholder="Current password"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    secureTextEntry={!showCurrentPwd}
                  />
                  <Pressable onPress={() => setShowCurrentPwd(v => !v)} hitSlop={8}>
                    <Ionicons
                      name={showCurrentPwd ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={isDark ? 'rgba(255,255,255,0.45)' : colors.slate[400]}
                    />
                  </Pressable>
                </GlassInput>
                <GlassInput icon="lock-closed-outline" isDark={isDark}>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={newPwd}
                    onChangeText={setNewPwd}
                    placeholder="New password (min. 8 chars)"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    secureTextEntry={!showNewPwd}
                  />
                  <Pressable onPress={() => setShowNewPwd(v => !v)} hitSlop={8}>
                    <Ionicons
                      name={showNewPwd ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={isDark ? 'rgba(255,255,255,0.45)' : colors.slate[400]}
                    />
                  </Pressable>
                </GlassInput>
                <GlassInput icon="lock-closed-outline" isDark={isDark}>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    placeholder="Confirm new password"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    secureTextEntry={!showNewPwd}
                  />
                </GlassInput>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn, isDark && { borderColor: colors.dark.border }]}
                  onPress={() => setShowChangePwd(false)}
                >
                  <Text style={[styles.modalCancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalSaveBtn} onPress={handleChangePwd} disabled={pwdSaving}>
                  <LinearGradient
                    colors={['#A855F7', '#6366F1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalSaveBtnGrad}
                  >
                    {pwdSaving
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={styles.modalSaveText}>Update Password</Text>
                    }
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingBottom: 52,
    gap: 6,
    position: 'relative',
    overflow: 'hidden',
  },

  // Decorative orbs
  orb1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.10)',
    top: -50,
    left: -40,
  },
  orb2: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: 20,
    right: -30,
  },
  orb3: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    bottom: 40,
    left: 30,
  },

  editBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  avatarRing: {
    padding: 4,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  avatarRingInner: {
    padding: 3,
    borderRadius: 50,
    borderWidth: 2.5,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: colors.white },
  heroName:   { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  heroEmail:  { fontSize: 13, color: 'rgba(255,255,255,0.70)', marginTop: -2 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },

  // Wave transition layers
  waveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
  },
  waveBack: {
    position: 'absolute',
    bottom: 0,
    left: -8,
    right: -8,
    height: 36,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  waveFront: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: -6,
    marginBottom: 4,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(74,108,247,0.10)',
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[900],
    textAlign: 'center',
  },
  statLabel: { fontSize: 10, color: colors.slate[400], textAlign: 'center' },

  // ── Content ──
  content: { padding: 16, gap: 8 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[400],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingLeft: 4,
    marginTop: 10,
    marginBottom: 4,
  },

  // ── Card ──
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },

  // ── Row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: colors.white,
    minHeight: 58,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText:  { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: colors.slate[900] },
  rowDesc:  { fontSize: 12, color: colors.slate[400] },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.slate[100],
    marginLeft: 66,
  },

  // ── Emergency contact edit ──
  emergencyInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: colors.white,
  },
  emergencyInput: {
    flex: 1, fontSize: 15, color: colors.slate[900], paddingVertical: 0,
  },
  emergencyActions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  emergencyCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: 12,
    borderWidth: 1, borderColor: colors.slate[200],
  },
  emergencyCancelText: { fontSize: 14, fontWeight: '500', color: colors.slate[600] },
  emergencySaveBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emergencySaveBtnGrad: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  emergencySaveText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // ── Logout ──
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.severity.critical + '0E',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.severity.critical + '22',
    marginTop: 4,
  },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.severity.critical + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.severity.critical,
  },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 24,
  },

  // Gradient header bar inside modal
  modalGradHeader: {
    paddingTop: 14,
    paddingBottom: 20,
    paddingHorizontal: 22,
    alignItems: 'flex-start',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    alignSelf: 'center', marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
  },

  modalBody: {
    padding: 22,
    paddingBottom: 36,
  },

  modalTitle: {
    fontSize: 20, fontWeight: '800', color: colors.slate[900],
    marginBottom: 20, letterSpacing: -0.2,
  },
  modalFields: { gap: 12, marginBottom: 22 },
  modalFieldRow: { flexDirection: 'row', gap: 10 },

  // Glassmorphic field
  glassField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },

  // Keep for backward compat if referenced elsewhere
  modalField: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 52, borderRadius: 14,
    backgroundColor: colors.slate[50],
    borderWidth: 1, borderColor: colors.slate[200],
    paddingHorizontal: 14,
  },
  modalInput: {
    flex: 1, fontSize: 15, color: colors.slate[900],
    height: '100%', paddingVertical: 0,
  },
  modalActions: {
    flexDirection: 'row', gap: 10,
  },
  modalCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    height: 50, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.slate[200],
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.slate[600] },
  modalSaveBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalSaveBtnGrad: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
