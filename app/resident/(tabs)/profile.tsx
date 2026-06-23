/**
 * Profile screen — premium redesign
 * Hero header with avatar ring · stat cards · icon-tinted rows · smooth toggles
 */
import { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';

// ─── Row icon colors per key ──────────────────────────────────────────────────

const ICON_COLORS: Record<string, string> = {
  'person-outline':            '#4F8EF7',
  'lock-closed-outline':       '#A855F7',
  'call-outline':              '#10B981',
  'call':                      '#10B981',
  'alert-circle-outline':      colors.severity.critical,
  'information-circle-outline':'#F59E0B',
  'document-text-outline':     colors.brand[500],
  'shield-outline':            '#6366F1',
  'help-circle-outline':       '#0EA5E9',
  'information-outline':       colors.slate[400],
  'log-out-outline':           colors.severity.critical,
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
          pressed && onPress && { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50] },
        ]}
        accessibilityRole={onPress ? 'button' : 'none'}
        accessibilityLabel={label}
      >
        {/* Tinted icon tile */}
        <View style={[styles.rowIcon, { backgroundColor: accentColor + '18' }]}>
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
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={[styles.statTile, isDark && { backgroundColor: colors.dark.card }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[styles.statValue, isDark && { color: colors.white }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, isDark && { color: colors.slate[500] }]}>{label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user, logout } = useAuth();
  const { showAlert } = useAlert();

  const [notifCritical,    setNotifCritical]    = useState(true);
  const [notifAdvisory,    setNotifAdvisory]    = useState(true);
  const [notifMyReports,   setNotifMyReports]   = useState(true);
  const [emergencyName,    setEmergencyName]    = useState('');
  const [emergencyPhone,   setEmergencyPhone]   = useState('');
  const [editingEmergency, setEditingEmergency] = useState(false);
  const [tempName,         setTempName]         = useState('');
  const [tempPhone,        setTempPhone]        = useState('');

  useEffect(() => {
    Promise.all([
      SecureStore.getItemAsync('ft_emergency_name'),
      SecureStore.getItemAsync('ft_emergency_phone'),
    ]).then(([name, phone]) => {
      if (name)  setEmergencyName(name);
      if (phone) setEmergencyPhone(phone);
    }).catch(() => {});
  }, []);

  function saveEmergencyContact() {
    Promise.all([
      SecureStore.setItemAsync('ft_emergency_name',  tempName),
      SecureStore.setItemAsync('ft_emergency_phone', tempPhone),
    ]).catch(() => {});
    setEmergencyName(tempName);
    setEmergencyPhone(tempPhone);
    setEditingEmergency(false);
  }

  const screenBg  = isDark ? colors.dark.bg      : '#F2F4F8';
  const headerBg  = isDark ? colors.dark.surface  : colors.brand[500];
  const roleColor = user?.role === 'Responder' ? colors.accent[500] : colors.brand[300];
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

        {/* ── Hero header ── */}
        <View style={[styles.hero, { paddingTop: insets.top + 20, backgroundColor: headerBg }]}>

          {/* Edit shortcut */}
          <Pressable style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="pencil" size={15} color="rgba(255,255,255,0.85)" />
          </Pressable>

          {/* Avatar ring */}
          <View style={styles.avatarRing}>
            <View style={[styles.avatarRingInner, { borderColor: roleColor }]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.heroName}>{fullName}</Text>
          <Text style={styles.heroEmail}>{user?.email ?? '—'}</Text>

          {/* Role badge */}
          <View style={[styles.roleBadge, { backgroundColor: roleColor + '28', borderColor: roleColor + '60' }]}>
            <Ionicons
              name={user?.role === 'Responder' ? 'shield-checkmark' : 'person-circle'}
              size={11}
              color={roleColor}
            />
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>
              {user?.role ?? 'Resident'}
            </Text>
          </View>

          {/* Curved bottom edge */}
          <View style={[styles.heroCurve, { backgroundColor: screenBg }]} />
        </View>

        {/* ── Stat cards ── */}
        <View style={styles.statsRow}>
          <StatTile
            value={user?.role ?? '—'}
            label="Role"
            icon="shield-outline"
            color={accentBrand}
            isDark={isDark}
          />
          <StatTile
            value={user?.contact ?? '—'}
            label="Mobile"
            icon="call-outline"
            color="#10B981"
            isDark={isDark}
          />
          <StatTile
            value={joinedYear}
            label="Member since"
            icon="calendar-outline"
            color="#A855F7"
            isDark={isDark}
          />
        </View>

        <View style={styles.content}>

          {/* ── Account ── */}
          <SectionLabel title="Account" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card }]}>
            <SettingRow
              icon="person-outline"
              label="Edit profile"
              description="Name, contact number"
              onPress={() => showAlert({ type: 'info', title: 'Coming Soon', message: 'Profile editing will be available in the next update.' })}
              isDark={isDark}
            />
            <SettingRow
              icon="lock-closed-outline"
              label="Change password"
              onPress={() => showAlert({ type: 'info', title: 'Coming Soon', message: 'Password change will be available in the next update.' })}
              isDark={isDark}
            />
            <SettingRow icon="call-outline" label="Mobile number" description={user?.contact ?? '—'} isDark={isDark} isLast />
          </View>

          {/* ── Notifications ── */}
          <SectionLabel title="Notifications" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card }]}>
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
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card }]}>
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
                    <Text style={styles.emergencySaveText}>Save</Text>
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
          <View style={[styles.card, isDark && { backgroundColor: colors.dark.card }]}>
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

        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingBottom: 48,
    gap: 6,
    position: 'relative',
  },
  editBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarRing: {
    padding: 3,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 2,
  },
  avatarRingInner: {
    padding: 3,
    borderRadius: 48,
    borderWidth: 2.5,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: colors.white },
  heroName:   { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  heroEmail:  { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: -2 },
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
  // Curved bottom overlap
  heroCurve: {
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
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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
    borderRadius: 10,
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
    paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: colors.slate[200],
  },
  emergencyCancelText: { fontSize: 14, fontWeight: '500', color: colors.slate[600] },
  emergencySaveBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: colors.brand[500],
  },
  emergencySaveText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // ── Logout ──
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.severity.critical + '0E',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.severity.critical + '22',
    marginTop: 4,
  },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
});
