import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { updateProfile, changePassword, updateDutyStatus, uploadAvatar, getCurrentUser } from '@/services/api';
import * as Storage from '@/utils/storage';

function getStrengthLevel(len: number): { score: number; label: string; color: string } {
  if (len === 0) return { score: 0, label: '', color: '' };
  if (len < 8)  return { score: 1, label: 'Too Short', color: colors.severity.critical };
  if (len < 10) return { score: 2, label: 'Weak',      color: colors.severity.high };
  if (len < 13) return { score: 3, label: 'Medium',    color: colors.severity.moderate };
  return              { score: 4, label: 'Strong',     color: '#66BB6A' };
}

function PasswordStrengthBar({
  password,
  isDark,
}: {
  password: string;
  isDark: boolean;
}) {
  const { score, label, color } = getStrengthLevel(password.length);
  const textTertiary = isDark ? colors.slate[500] : colors.slate[400];

  if (!password) return null;

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: textTertiary }}>Password Strength</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: i <= score ? color : isDark ? colors.responder.dark.border : colors.slate[200],
            }}
          />
        ))}
      </View>
    </View>
  );
}

const ICON_COLORS: Record<string, string> = {
  'person-outline':             '#4F8EF7',
  'lock-closed-outline':        '#A855F7',
  'call-outline':               '#10B981',
  'alert-circle-outline':       colors.severity.critical,
  'information-circle-outline': '#F59E0B',
  'document-text-outline':      colors.brand[500],
  'shield-outline':             '#6366F1',
  'help-circle-outline':        '#0EA5E9',
  'information-outline':        colors.slate[400],
  'log-out-outline':            colors.severity.critical,
};

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
          isDark && { backgroundColor: colors.responder.dark.card },
          pressed && onPress && {
            backgroundColor: isDark ? colors.responder.dark.elevated : '#F0F4FF',
          },
        ]}
        accessibilityRole={onPress ? 'button' : 'none'}
        accessibilityLabel={label}
      >
        <View style={[styles.rowIcon, { backgroundColor: accentColor + '20' }]}>
          <Ionicons name={icon} size={17} color={accentColor} />
        </View>

        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
          {description && (
            <Text style={[styles.rowDesc, isDark && { color: colors.slate[500] }]}>
              {description}
            </Text>
          )}
        </View>

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

function SectionLabel({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <Text style={[styles.sectionLabel, isDark && { color: colors.slate[500] }]}>
      {title}
    </Text>
  );
}

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
        isDark && { backgroundColor: colors.responder.dark.card, borderColor: colors.responder.dark.border },
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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user, token, logout, updateUser, setHomeAddress } = useAuth();
  const { showAlert } = useAlert();

  const [avatarUploading, setAvatarUploading] = useState(false);

  const [isOnDuty, setIsOnDuty] = useState(false);
  const [dutyLoading, setDutyLoading] = useState(false);

  const [notifCritical,  setNotifCritical]  = useState(true);
  const [notifAdvisory,  setNotifAdvisory]  = useState(true);
  const [notifMyReports, setNotifMyReports] = useState(true);

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editFirstName, setEditFirstName]     = useState('');
  const [editLastName, setEditLastName]       = useState('');
  const [editContact, setEditContact]         = useState('');
  const [editHomeAddress, setEditHomeAddress] = useState('');
  const [editAddressLoading, setEditAddressLoading] = useState(false);
  const [editSaving, setEditSaving]           = useState(false);

  const [showChangePwd, setShowChangePwd]         = useState(false);
  const [currentPwd, setCurrentPwd]               = useState('');
  const [newPwd, setNewPwd]                       = useState('');
  const [confirmPwd, setConfirmPwd]               = useState('');
  const [pwdSaving, setPwdSaving]                 = useState(false);
  const [showCurrentPwd, setShowCurrentPwd]       = useState(false);
  const [showNewPwd, setShowNewPwd]               = useState(false);

  const heroAnim    = useRef(new Animated.Value(0)).current;
  const stat0Anim   = useRef(new Animated.Value(0)).current;
  const stat1Anim   = useRef(new Animated.Value(0)).current;
  const stat2Anim   = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!token) return;
    getCurrentUser(token).then(data => {
      setIsOnDuty(data.isOnDuty ?? false);
    }).catch(() => {});
  }, [token]);

  // Load notification preferences from storage
  useEffect(() => {
    Promise.all([
      Storage.getItem('ft_notif_critical'),
      Storage.getItem('ft_notif_advisory'),
      Storage.getItem('ft_notif_reports'),
    ]).then(([nc, na, nr]) => {
      if (nc !== null) setNotifCritical(nc !== 'false');
      if (na !== null) setNotifAdvisory(na !== 'false');
      if (nr !== null) setNotifMyReports(nr !== 'false');
    }).catch(() => {});
  }, []);

  // Persist notification preferences
  useEffect(() => { Storage.setItem('ft_notif_critical', String(notifCritical)); }, [notifCritical]);
  useEffect(() => { Storage.setItem('ft_notif_advisory', String(notifAdvisory)); }, [notifAdvisory]);
  useEffect(() => { Storage.setItem('ft_notif_reports',  String(notifMyReports)); }, [notifMyReports]);

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

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ type: 'error', title: 'Permission needed', message: 'Please allow photo access to change your profile picture.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const localUri = result.assets[0].uri;
    // Show picked image immediately (optimistic update)
    const previousUser = user;
    await updateUser({ ...user!, avatarUrl: localUri });
    setAvatarUploading(true);
    try {
      const updated = await uploadAvatar(localUri, token!);
      await updateUser(updated);
      showAlert({ type: 'success', title: 'Updated', message: 'Profile picture updated.' });
    } catch (e: any) {
      // Revert to previous avatar on failure
      if (previousUser) await updateUser(previousUser);
      showAlert({ type: 'error', title: 'Failed', message: e?.message ?? 'Could not upload profile picture.' });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function toggleDuty(value: boolean) {
    setDutyLoading(true);
    try {
      await updateDutyStatus(value, token!);
      setIsOnDuty(value);
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Failed', message: e?.message ?? 'Could not update duty status.' });
    } finally {
      setDutyLoading(false);
    }
  }

  function openEditProfile() {
    setEditFirstName(user?.firstName ?? '');
    setEditLastName(user?.lastName ?? '');
    setEditContact(user?.contact ?? '');
    setEditHomeAddress(user?.homeAddress ?? '');
    setShowEditProfile(true);
  }

  async function handleUseLocationForAddress() {
    setEditAddressLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert({ type: 'warning', title: 'Permission Needed', message: 'Allow location permission to auto-fill your address.' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const parts = [geo.street, geo.district, geo.city, geo.region]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      setEditHomeAddress(parts.join(', ') || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
    } catch {
      showAlert({ type: 'warning', title: 'Error', message: 'Could not get your location.' });
    } finally {
      setEditAddressLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!editFirstName.trim() || !editLastName.trim()) {
      showAlert({ type: 'error', title: 'Error', message: 'Name fields cannot be empty.' });
      return;
    }
    setEditSaving(true);
    try {
      const newAddress = editHomeAddress.trim() || null;
      const updated = await updateProfile({
        name: `${editFirstName.trim()} ${editLastName.trim()}`,
        contact_number: editContact.trim() || undefined,
        home_address: newAddress,
      }, token!);
      await setHomeAddress(newAddress);
      await updateUser({ ...updated, homeAddress: newAddress });
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
    setShowCurrentPwd(false);
    setShowNewPwd(false);
    setShowChangePwd(true);
  }

  const pwdStrength = getStrengthLevel(newPwd.length);
  const allChecksMet = newPwd.length >= 8 && newPwd.length <= 16;
  const passwordsMatch = newPwd.length > 0 && newPwd === confirmPwd;

  async function handleChangePwd() {
    if (!currentPwd) {
      showAlert({ type: 'error', title: 'Error', message: 'Enter your current password.' });
      return;
    }
    if (!allChecksMet) {
      showAlert({ type: 'error', title: 'Invalid Password', message: 'Password must be between 8 and 16 characters.' });
      return;
    }
    if (!passwordsMatch) {
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

  const screenBg    = isDark ? colors.responder.dark.bg : '#F0F4FA';
  const roleColor   = colors.brand[500];
  const accentBrand = colors.brand[500];

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
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >

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
            style={[styles.hero, { paddingTop: insets.top + 12 }]}
          >
            <View style={styles.orb1} />
            <View style={styles.orb2} />
            <View style={styles.orb3} />

            <Pressable onPress={handlePickAvatar} style={styles.avatarRing} disabled={avatarUploading}>
              <View style={[styles.avatarRingInner, { borderColor: roleColor }]}>
                {user?.avatarUrl ? (
                  <Image
                    key={user.avatarUrl}
                    source={{ uri: user.avatarUrl, cache: 'reload' }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.10)']}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>{initials}</Text>
                  </LinearGradient>
                )}
              </View>
              <View style={styles.avatarCameraBtn}>
                {avatarUploading ? (
                  <ActivityIndicator size={12} color={colors.white} />
                ) : (
                  <Ionicons name="camera" size={13} color={colors.white} />
                )}
              </View>
            </Pressable>

            <Text style={styles.heroName}>{fullName}</Text>
            <Text style={styles.heroEmail}>{user?.email ?? '—'}</Text>

            <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)' }]}>
              <Ionicons name="shield-checkmark" size={11} color={colors.white} />
              <Text style={[styles.roleBadgeText, { color: colors.white }]}>
                {user?.role ?? 'Responder'}
              </Text>
            </View>

            <View style={styles.waveContainer} pointerEvents="none">
              <View style={[styles.waveBack, { backgroundColor: screenBg, opacity: 0.35 }]} />
              <View style={[styles.waveFront, { backgroundColor: screenBg }]} />
            </View>
          </LinearGradient>
        </Animated.View>

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

          <SectionLabel title="Duty Status" isDark={isDark} />
          <View style={[
            styles.card,
            isDark && { backgroundColor: colors.responder.dark.card, borderColor: colors.responder.dark.border },
            isOnDuty && { borderWidth: 1.5, borderColor: colors.severity.low + '40' },
          ]}>
            <View style={[styles.row, isDark && { backgroundColor: colors.responder.dark.card }]}>
              <View style={[
                styles.rowIcon,
                { backgroundColor: (isOnDuty ? colors.severity.low : colors.slate[400]) + '18' },
              ]}>
                <Ionicons
                  name={isOnDuty ? 'shield-checkmark' : 'shield-outline'}
                  size={17}
                  color={isOnDuty ? colors.severity.low : colors.slate[400]}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, isDark && { color: colors.white }]}>
                  {isOnDuty ? 'On Duty' : 'Off Duty'}
                </Text>
                <Text style={[styles.rowDesc, isDark && { color: colors.slate[500] }]}>
                  {isOnDuty ? 'You are available for incident assignments' : 'You will not receive new assignments'}
                </Text>
              </View>
              {dutyLoading ? (
                <ActivityIndicator size="small" color={accentBrand} />
              ) : (
                <Switch
                  value={isOnDuty}
                  onValueChange={toggleDuty}
                  trackColor={switchTrack}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.slate[200]}
                  accessibilityLabel="Toggle duty status"
                />
              )}
            </View>
            {isOnDuty && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingBottom: 14, marginTop: -6,
              }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.severity.low }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.severity.low }}>
                  Active and receiving assignments
                </Text>
              </View>
            )}
          </View>

          <SectionLabel title="Account" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.responder.dark.card, borderColor: colors.responder.dark.border }]}>
            <SettingRow
              icon="person-outline"
              label="Edit profile"
              description="Name, contact, home address"
              onPress={openEditProfile}
              isDark={isDark}
            />
            <SettingRow
              icon="lock-closed-outline"
              label="Change password"
              onPress={openChangePwd}
              isDark={isDark}
            />
            <SettingRow icon="call-outline" label="Mobile number" description={user?.contact ?? '—'} isDark={isDark} />
            <SettingRow icon="home-outline" label="Home address" description={user?.homeAddress ?? 'Not set — edit profile to add'} isDark={isDark} isLast />
          </View>

          <SectionLabel title="Notifications" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.responder.dark.card, borderColor: colors.responder.dark.border }]}>
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

          <SectionLabel title="About" isDark={isDark} />
          <View style={[styles.card, isDark && { backgroundColor: colors.responder.dark.card, borderColor: colors.responder.dark.border }]}>
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

      <Modal visible={showEditProfile} transparent animationType="slide" onRequestClose={() => setShowEditProfile(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && { backgroundColor: colors.responder.dark.elevated }]}>
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
                <GlassInput icon="home-outline" isDark={isDark}>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={editHomeAddress}
                    onChangeText={setEditHomeAddress}
                    placeholder="Home address"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    autoCapitalize="words"
                  />
                  <Pressable onPress={handleUseLocationForAddress} hitSlop={8} disabled={editAddressLoading}>
                    {editAddressLoading
                      ? <ActivityIndicator size="small" color={colors.brand[500]} />
                      : <Ionicons name="locate" size={18} color={colors.brand[500]} />
                    }
                  </Pressable>
                </GlassInput>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn, isDark && { borderColor: colors.responder.dark.border }]}
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

      <Modal visible={showChangePwd} transparent animationType="slide" onRequestClose={() => setShowChangePwd(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, isDark && { backgroundColor: colors.responder.dark.elevated }]}>
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
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
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

                <GlassInput icon="lock-closed-outline" isDark={isDark} style={
                  newPwd.length > 0
                    ? { borderColor: (allChecksMet ? colors.severity.low : pwdStrength.color) + '60' }
                    : undefined
                }>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={newPwd}
                    onChangeText={setNewPwd}
                    placeholder="New password (8–16 chars)"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    secureTextEntry={!showNewPwd}
                    maxLength={16}
                  />
                  <Pressable onPress={() => setShowNewPwd(v => !v)} hitSlop={8}>
                    <Ionicons
                      name={showNewPwd ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={isDark ? 'rgba(255,255,255,0.45)' : colors.slate[400]}
                    />
                  </Pressable>
                </GlassInput>

                <PasswordStrengthBar password={newPwd} isDark={isDark} />

                <GlassInput icon="lock-closed-outline" isDark={isDark} style={
                  confirmPwd.length > 0
                    ? { borderColor: (passwordsMatch ? colors.severity.low : colors.severity.critical) + '60' }
                    : undefined
                }>
                  <TextInput
                    style={[styles.modalInput, isDark && { color: colors.white }]}
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    placeholder="Confirm new password"
                    placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.slate[400]}
                    secureTextEntry={!showNewPwd}
                    maxLength={16}
                  />
                </GlassInput>

                {confirmPwd.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons
                      name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={passwordsMatch ? colors.severity.low : colors.severity.critical}
                    />
                    <Text style={{
                      fontSize: 11, fontWeight: '600',
                      color: passwordsMatch ? colors.severity.low : colors.severity.critical,
                    }}>
                      {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                    </Text>
                  </View>
                )}
              </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn, isDark && { borderColor: colors.responder.dark.border }]}
                  onPress={() => setShowChangePwd(false)}
                >
                  <Text style={[styles.modalCancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSaveBtn, (!allChecksMet || !passwordsMatch || !currentPwd) && { opacity: 0.5 }]}
                  onPress={handleChangePwd}
                  disabled={pwdSaving || !allChecksMet || !passwordsMatch || !currentPwd}
                >
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

const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: {
    alignItems: 'center',
    paddingBottom: 40,
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },

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
    overflow: 'hidden',
  },
  avatarCameraBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
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

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: -6,
    marginBottom: 2,
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

  content: { padding: 16, gap: 6 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[400],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingLeft: 4,
    marginTop: 6,
    marginBottom: 2,
  },

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

  modalFields: { gap: 12, marginBottom: 22 },
  modalFieldRow: { flexDirection: 'row', gap: 10 },

  glassField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
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
