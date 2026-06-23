import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { colors as C } from '@/theme/colors';

// ─── Validation ────────────────────────────────────────────────────────────────

const PH_MOBILE_RE = /^(\+639|09)\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(fields: FormFields): FormErrors {
  const errors: FormErrors = {};
  if (!fields.firstName.trim()) errors.firstName = 'Required.';
  if (!fields.lastName.trim()) errors.lastName = 'Required.';
  if (!fields.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_RE.test(fields.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  const phone = fields.contact.replace(/\s/g, '');
  if (!phone) {
    errors.contact = 'Contact number is required.';
  } else if (!PH_MOBILE_RE.test(phone)) {
    errors.contact = 'Must be 09XX XXX XXXX or +639XX XXX XXXX.';
  }
  if (!fields.password) {
    errors.password = 'Password is required.';
  } else if (fields.password.length < 8) {
    errors.password = 'Must be at least 8 characters.';
  }
  if (fields.confirmPassword !== fields.password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormFields {
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  password: string;
  confirmPassword: string;
}

type FormErrors = Partial<Record<keyof FormFields, string>>;

// ─── InputField ────────────────────────────────────────────────────────────────

type InputFieldProps = TextInputProps & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  right?: React.ReactNode;
  isDark: boolean;
  tint: string;
  textColor: string;
};

function InputField({ label, icon, error, right, isDark, tint, textColor, style, ...rest }: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  const bg          = isDark ? '#161B22' : C.slate[50];
  const borderColor = error ? C.severity.critical : focused ? tint : isDark ? '#21262D' : C.slate[200];
  const iconColor   = error ? C.severity.critical : focused ? tint : C.slate[400];

  return (
    <View style={f.wrapper}>
      <Text style={[f.label, { color: isDark ? C.slate[400] : C.slate[500] }]}>{label}</Text>
      <View style={[
        f.row,
        { backgroundColor: bg, borderColor },
        focused && { borderWidth: 2, shadowColor: error ? C.severity.critical : tint, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 },
      ]}>
        <View style={[f.iconWrap, focused && { backgroundColor: iconColor + '18' }]}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
        <TextInput
          style={[f.input, { color: textColor }, style]}
          placeholderTextColor={isDark ? '#3D444D' : C.slate[400]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {right}
      </View>
      {error && (
        <View style={f.errorRow}>
          <Ionicons name="alert-circle" size={12} color={C.severity.critical} />
          <Text style={f.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const f = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: 10, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginLeft: 2,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 14, borderWidth: 1.5,
    paddingRight: 14, gap: 0, overflow: 'hidden',
  },
  iconWrap: {
    width: 52, height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 2 },
  errorText: { fontSize: 11, color: C.severity.critical, fontWeight: '500' },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function SignUpScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const tint      = C.brand[500];
  const cardBg    = isDark ? '#0D1117' : C.white;
  const textColor = isDark ? C.white   : C.slate[900];
  const subColor  = isDark ? C.slate[400] : C.slate[500];

  const [fields, setFields] = useState<FormFields>({
    firstName: '', lastName: '', email: '',
    contact: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [errors,       setErrors]       = useState<FormErrors>({});
  const [submitted,    setSubmitted]    = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [apiError,     setApiError]     = useState<string | null>(null);

  function set(key: keyof FormFields) {
    return (value: string) => {
      setFields(prev => ({ ...prev, [key]: value }));
      if (submitted) setErrors(prev => ({ ...prev, [key]: undefined }));
      setApiError(null);
    };
  }

  async function handleSubmit() {
    setSubmitted(true);
    const errs = validateForm(fields);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setLoading(true);
    setApiError(null);
    try {
      await register({
        firstName: fields.firstName.trim(),
        lastName:  fields.lastName.trim(),
        email:     fields.email.trim(),
        contact:   fields.contact.trim(),
        password:  fields.password,
        role:      'Resident',
      });
    } catch {
      setApiError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: C.brand[700] }]}>
      <StatusBar style="light" />

      {/* ── Hero ── */}
      <View style={[s.hero, { paddingTop: insets.top + 16 }]}>
        <View style={s.heroTopRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12} accessibilityRole="button">
            <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.85)" />
          </Pressable>

          {/* Logo pill */}
          <View style={s.logoPill}>
            <Ionicons name="water" size={14} color={C.white} />
            <Text style={s.logoPillText}>FloodTrack</Text>
          </View>

          <View style={{ width: 36 }} />
        </View>

        <View style={s.heroText}>
          <Text style={s.heroTitle}>Create account</Text>
          <Text style={s.heroSub}>Join FloodTrack — stay informed, stay safe.</Text>
        </View>
      </View>

      {/* Curve */}
      <View style={[s.curve, { backgroundColor: cardBg }]} />

      {/* ── Form card ── */}
      <KeyboardAvoidingView
        style={[s.cardShell, { backgroundColor: cardBg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Divider ── */}
          <View style={s.divBlock}>
            <View style={[s.divLine, { backgroundColor: isDark ? '#21262D' : C.slate[100] }]} />
            <Text style={[s.divText, { color: subColor }]}>Personal info</Text>
            <View style={[s.divLine, { backgroundColor: isDark ? '#21262D' : C.slate[100] }]} />
          </View>

          {/* Name row */}
          <View style={s.nameRow}>
            <View style={{ flex: 1 }}>
              <InputField
                label="First name"
                icon="person-outline"
                placeholder="Juan"
                autoCapitalize="words"
                textContentType="givenName"
                value={fields.firstName}
                onChangeText={set('firstName')}
                error={errors.firstName}
                isDark={isDark} tint={tint} textColor={textColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                label="Last name"
                icon="person-outline"
                placeholder="Dela Cruz"
                autoCapitalize="words"
                textContentType="familyName"
                value={fields.lastName}
                onChangeText={set('lastName')}
                error={errors.lastName}
                isDark={isDark} tint={tint} textColor={textColor}
              />
            </View>
          </View>

          <InputField
            label="Email address"
            icon="mail-outline"
            placeholder="juan@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={fields.email}
            onChangeText={set('email')}
            error={errors.email}
            isDark={isDark} tint={tint} textColor={textColor}
          />

          <InputField
            label="Mobile number"
            icon="call-outline"
            placeholder="0917 123 4567"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={fields.contact}
            onChangeText={set('contact')}
            error={errors.contact}
            isDark={isDark} tint={tint} textColor={textColor}
            maxLength={16}
          />

          {/* ── Divider ── */}
          <View style={s.divBlock}>
            <View style={[s.divLine, { backgroundColor: isDark ? '#21262D' : C.slate[100] }]} />
            <Text style={[s.divText, { color: subColor }]}>Security</Text>
            <View style={[s.divLine, { backgroundColor: isDark ? '#21262D' : C.slate[100] }]} />
          </View>

          <InputField
            label="Password"
            icon="lock-closed-outline"
            placeholder="Min. 8 characters"
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            value={fields.password}
            onChangeText={set('password')}
            error={errors.password}
            isDark={isDark} tint={tint} textColor={textColor}
            right={
              <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8} style={{ paddingRight: 4 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.slate[400]} />
              </Pressable>
            }
          />

          <InputField
            label="Confirm password"
            icon="lock-closed-outline"
            placeholder="Re-enter your password"
            secureTextEntry={!showConfirm}
            textContentType="newPassword"
            value={fields.confirmPassword}
            onChangeText={set('confirmPassword')}
            error={errors.confirmPassword}
            isDark={isDark} tint={tint} textColor={textColor}
            right={
              <Pressable onPress={() => setShowConfirm(v => !v)} hitSlop={8} style={{ paddingRight: 4 }}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.slate[400]} />
              </Pressable>
            }
          />

          {/* API error */}
          {apiError && (
            <View style={s.errorBanner}>
              <View style={s.errorIcon}>
                <Ionicons name="alert-circle" size={16} color={C.severity.critical} />
              </View>
              <Text style={s.errorText}>{apiError}</Text>
            </View>
          )}

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              s.submitBtn,
              { backgroundColor: tint },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
              loading && { opacity: 0.7 },
            ]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            {loading
              ? <ActivityIndicator color={C.white} />
              : (
                <>
                  <Text style={s.submitText}>Create account</Text>
                  <View style={s.submitArrow}>
                    <Ionicons name="arrow-forward" size={16} color={C.white} />
                  </View>
                </>
              )
            }
          </Pressable>

          {/* Footer */}
          <View style={s.footer}>
            <Text style={[s.footerText, { color: subColor }]}>Already have an account?</Text>
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="link">
              <Text style={[s.footerLink, { color: tint }]}> Log in</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Hero ──
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  logoPillText: { color: C.white, fontSize: 13, fontWeight: '700' },
  heroText:  { gap: 6 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: C.white, letterSpacing: -0.5 },
  heroSub:   { fontSize: 13, color: 'rgba(255,255,255,0.62)' },

  // Curve
  curve: {
    height: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -32,
  },

  // Card
  cardShell: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 14,
  },

  // Divider
  divBlock:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine:   { flex: 1, height: 1 },
  divText:   { fontSize: 11, fontWeight: '600' },

  // Name row
  nameRow: { flexDirection: 'row', gap: 12 },

  // Error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.severity.critical + '10',
    borderWidth: 1, borderColor: C.severity.critical + '35',
    borderRadius: 12, padding: 12,
  },
  errorIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: C.severity.critical + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  errorText: { flex: 1, fontSize: 13, color: C.severity.critical, fontWeight: '500' },

  // Submit
  submitBtn: {
    height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
    shadowColor: C.brand[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  submitText:  { color: C.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  submitArrow: {
    position: 'absolute', right: 18,
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Footer
  footer:     { flexDirection: 'row', justifyContent: 'center', paddingTop: 4 },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '700' },
});
