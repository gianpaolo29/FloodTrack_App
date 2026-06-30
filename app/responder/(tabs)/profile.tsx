/**
 * Profile screen — premium redesign
 * Hero header with avatar ring · stat cards · icon-tinted rows · smooth toggles
 */
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { updateProfile, changePassword } from '@/services/api';

// ─── Row icon colors per key ──────────────────────────────────────────────────

const ICON_COLORS: Record<string, string> = {
  'person-outline':            '#4F8EF7',
  'lock-closed-outline':       '#A855F7',
  'call-outline':              '#10B981',
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
          isDark && { backgroundColor: colors.slate[900] },
          pressed && onPress && { backgroundColor: isDark ? '#1a2030' : colors.slate[50] },
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
    <View style={[styles.statTile, isDark && { backgroundColor: colors.slate[900] }]}>
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
  const { user, token, logout, updateUser } = useAuth();
  const { showAlert } = useAlert();

  const [notifCritical,  setNotifCritical]  = useState(true);
  const [notifAdvisory,  setNotifAdvisory]  = useState(true);
  const [notifMyReports, setNotifMyReports] = useState(true);

  // Edit profile modal
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editFirstName, setEditFirstName]     = useState('');
  const [editLastName, setEditLastName]       = useState('');
  const [editContact, setEditContact]         = useState('');
  const [editSaving, setEditSaving]           = useState(false);

  // Change password modal
  const [showChangePwd, setShowChangePwd]         = useState(false);
  const [currentPwd, setCurrentPwd]               = useState('');
  const [newPwd, setNewPwd]                       = useState('');
  const [confirmPwd, setConfirmPwd]               = useState('');
  const [pwdSaving, setPwdSaving]                 = useState(false);
  const [showCurrentPwd, setShowCurrentPwd]       = useState(false);
  const [showNewPwd, setShowNewPwd]               = useState(false);

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
      const updated = await updateProfile({
        name: `${editFirstName.trim()} ${editLastName.trim()}`,
        contact_number: editContact.trim() || undefined,
      }, token!);
      await updateUser(updated);
      showAlert({ type: 'success', title: 'Updated', message: 'Your profile has been updated.' });
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
      showAlert({ type: 'error', title: 'Failed', message: e?.message ?? 'Could not change password.' });
    } finally {
      setPwdSaving(false);
    }
  }

  const screenBg  = isDark ? '#080C10' : '#F2F4F8';
  const headerBg  = isDark ? '#0D1117' : colors.accent[700];
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
          <Pressable style={styles.editBtn} onPress={openEditProfile} accessibilityRole="button" accessibilityLabel="Edit profile">
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
          <View style={[styles.card, isDark && { backgroundColor: colors.slate[900] }]}>
            <SettingRow icon="person-outline"      label="Edit profile"    description="Name, contact number" onPress={openEditProfile} isDark={isDark} />
            <SettingRow icon="lock-closed-outline" label="Change password" onPress={openChangePwd} isDark={isDark} />
            <SettingRow icon="call-outline"        label="Mobile number"   description={user?.contact ?? '—'} isDark={isDark} isLast />
          </View>

          {/* ── Notifications ── */}
          <SectionLabel title="Notifications" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.slate[900] }]}>
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

          {/* ── About ── */}
          <SectionLabel title="About" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.slate[900] }]}>
            <SettingRow icon="shield-outline"      label="Privacy policy" onPress={() => showAlert({ type: 'info', title: 'Privacy Policy', message: 'Your data is securely stored and never shared with third parties.' })} isDark={isDark} />
            <SettingRow icon="help-circle-outline" label="Help & support" onPress={() => showAlert({ type: 'info', title: 'Help & Support', message: 'For assistance, contact your local DRRM office or email support@floodtrack.ph.' })} isDark={isDark} />
            <SettingRow icon="information-outline" label="App version"    description="1.0.0" isDark={isDark} isLast />
          </View>

          {/* ── Log out ── */}
          <Pressable
            onPress={logout}
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

      {/* ═══════ Edit Profile Modal ═══════ */}
      <Modal visible={showEditProfile} transparent animationType="slide" onRequestClose={() => setShowEditProfile(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && { backgroundColor: colors.dark.elevated }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, isDark && { color: colors.white }]}>Edit Profile</Text>
            <View style={styles.modalFields}>
              <View style={styles.modalFieldRow}>
                <View style={[styles.modalField, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
                  <Ionicons name="person-outline" size={16} color={colors.slate[400]} />
                  <TextInput style={[styles.modalInput, isDark && { color: colors.white }]} value={editFirstName} onChangeText={setEditFirstName} placeholder="First name" placeholderTextColor={colors.slate[400]} autoCapitalize="words" />
                </View>
                <View style={[styles.modalField, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
                  <Ionicons name="person-outline" size={16} color={colors.slate[400]} />
                  <TextInput style={[styles.modalInput, isDark && { color: colors.white }]} value={editLastName} onChangeText={setEditLastName} placeholder="Last name" placeholderTextColor={colors.slate[400]} autoCapitalize="words" />
                </View>
              </View>
              <View style={[styles.modalField, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
                <Ionicons name="call-outline" size={16} color={colors.slate[400]} />
                <TextInput style={[styles.modalInput, isDark && { color: colors.white }]} value={editContact} onChangeText={setEditContact} placeholder="Contact number" placeholderTextColor={colors.slate[400]} keyboardType="phone-pad" />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalCancelBtn, isDark && { borderColor: colors.dark.border }]} onPress={() => setShowEditProfile(false)}>
                <Text style={[styles.modalCancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleSaveProfile} disabled={editSaving}>
                {editSaving ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.modalSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════ Change Password Modal ═══════ */}
      <Modal visible={showChangePwd} transparent animationType="slide" onRequestClose={() => setShowChangePwd(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && { backgroundColor: colors.dark.elevated }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, isDark && { color: colors.white }]}>Change Password</Text>
            <View style={styles.modalFields}>
              <View style={[styles.modalField, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.slate[400]} />
                <TextInput style={[styles.modalInput, isDark && { color: colors.white }]} value={currentPwd} onChangeText={setCurrentPwd} placeholder="Current password" placeholderTextColor={colors.slate[400]} secureTextEntry={!showCurrentPwd} />
                <Pressable onPress={() => setShowCurrentPwd(v => !v)} hitSlop={8}><Ionicons name={showCurrentPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.slate[400]} /></Pressable>
              </View>
              <View style={[styles.modalField, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.slate[400]} />
                <TextInput style={[styles.modalInput, isDark && { color: colors.white }]} value={newPwd} onChangeText={setNewPwd} placeholder="New password (min. 8)" placeholderTextColor={colors.slate[400]} secureTextEntry={!showNewPwd} />
                <Pressable onPress={() => setShowNewPwd(v => !v)} hitSlop={8}><Ionicons name={showNewPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.slate[400]} /></Pressable>
              </View>
              <View style={[styles.modalField, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.slate[400]} />
                <TextInput style={[styles.modalInput, isDark && { color: colors.white }]} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="Confirm new password" placeholderTextColor={colors.slate[400]} secureTextEntry={!showNewPwd} />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalCancelBtn, isDark && { borderColor: colors.dark.border }]} onPress={() => setShowChangePwd(false)}>
                <Text style={[styles.modalCancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleChangePwd} disabled={pwdSaving}>
                {pwdSaving ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.modalSaveText}>Update</Text>}
              </Pressable>
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

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.slate[300], alignSelf: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.slate[900], marginBottom: 20 },
  modalFields: { gap: 12, marginBottom: 22 },
  modalFieldRow: { flexDirection: 'row', gap: 10 },
  modalField: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 52, borderRadius: 14, backgroundColor: colors.slate[50],
    borderWidth: 1, borderColor: colors.slate[200], paddingHorizontal: 14,
  },
  modalInput: { flex: 1, fontSize: 15, color: colors.slate[900], height: '100%', paddingVertical: 0 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.slate[200],
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.slate[600] },
  modalSaveBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 14, backgroundColor: colors.accent[500],
  },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
