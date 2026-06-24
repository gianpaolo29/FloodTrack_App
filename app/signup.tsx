import { useState } from 'react';
import {
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
import { Colors } from '@/constants/theme';


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


type Role = 'Resident' | 'Responder';

interface FormFields {
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  password: string;
  confirmPassword: string;
}

type FormErrors = Partial<Record<keyof FormFields, string>>;


type InputFieldProps = TextInputProps & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  right?: React.ReactNode;
  isDark: boolean;
  tint: string;
  textColor: string;
};

function InputField({
  label,
  icon,
  error,
  right,
  isDark,
  tint,
  textColor,
  style,
  ...rest
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? '#D32F2F'
    : focused
    ? tint
    : isDark
    ? '#2C2C2E'
    : '#E8ECF0';

  const bg = isDark ? '#1C1C1E' : '#F7F9FB';
  const iconColor = error ? '#D32F2F' : focused ? tint : isDark ? '#636366' : '#9AA6B2';

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={[fieldStyles.label, { color: isDark ? '#9AA6B2' : '#5A6675' }]}>
        {label}
      </Text>
      <View
        style={[
          fieldStyles.inputRow,
          { backgroundColor: bg, borderColor },
        ]}
      >
        <Ionicons name={icon} size={18} color={iconColor} style={fieldStyles.icon} />
        <TextInput
          style={[fieldStyles.input, { color: textColor }, style]}
          placeholderTextColor={isDark ? '#48484A' : '#C7CDD3'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <View style={fieldStyles.errorRow}>
          <Ionicons name="alert-circle" size={13} color="#D32F2F" />
          <Text style={fieldStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    gap: 10,
  },
  icon: { width: 20, textAlign: 'center' },
  input: {
    flex: 1,
    fontSize: 15.5,
    height: '100%',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    fontWeight: '500',
  },
});

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function SignUpScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [fields, setFields] = useState<FormFields>({
    firstName: '',
    lastName: '',
    email: '',
    contact: '',
    password: '',
    confirmPassword: '',
  });
  const [role, setRole] = useState<Role>('Resident');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function set(key: keyof FormFields) {
    return (value: string) => {
      setFields(prev => ({ ...prev, [key]: value }));
      if (submitted) setErrors(prev => ({ ...prev, [key]: undefined }));
    };
  }

  function handleSubmit() {
    setSubmitted(true);
    const errs = validateForm(fields);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    // TODO: POST /api/register
    router.replace('/(tabs)');
  }

  const cardBg = isDark ? '#0D0D0F' : '#FFFFFF';
  const screenBg = isDark ? '#0D0D0F' : '#F0F4F8';

  return (
    <View style={[styles.root, { backgroundColor: colors.tint }]}>
      <StatusBar style="light" />

      {/* ── Hero header ── */}
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.9)" />
        </Pressable>

        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Create account</Text>
          <Text style={styles.heroSub}>Join FloodTrack — stay informed, stay safe.</Text>
        </View>
      </View>

      {/* ── Form card ── */}
      <KeyboardAvoidingView
        style={styles.cardShell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={[styles.card, { backgroundColor: cardBg }]}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Role selector */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: isDark ? '#9AA6B2' : '#5A6675' }]}>
              I am a
            </Text>
            <View style={[styles.roleTrack, { backgroundColor: isDark ? '#1C1C1E' : '#EDF1F5' }]}>
              {(['Resident', 'Responder'] as Role[]).map(r => {
                const active = role === r;
                return (
                  <Pressable
                    key={r}
                    style={[
                      styles.roleOption,
                      active && [styles.roleActive, { backgroundColor: colors.tint }],
                    ]}
                    onPress={() => setRole(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    <Ionicons
                      name={r === 'Resident' ? 'person' : 'shield-checkmark'}
                      size={14}
                      color={active ? '#fff' : isDark ? '#636366' : '#9AA6B2'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.roleText,
                        { color: active ? '#fff' : isDark ? '#636366' : '#9AA6B2' },
                      ]}
                    >
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Name row */}
          <View style={styles.nameRow}>
            <View style={styles.nameHalf}>
              <InputField
                label="First name"
                icon="person-outline"
                placeholder="Juan"
                autoCapitalize="words"
                textContentType="givenName"
                value={fields.firstName}
                onChangeText={set('firstName')}
                error={errors.firstName}
                isDark={isDark}
                tint={colors.tint}
                textColor={colors.text}
              />
            </View>
            <View style={styles.nameHalf}>
              <InputField
                label="Last name"
                icon="person-outline"
                placeholder="Dela Cruz"
                autoCapitalize="words"
                textContentType="familyName"
                value={fields.lastName}
                onChangeText={set('lastName')}
                error={errors.lastName}
                isDark={isDark}
                tint={colors.tint}
                textColor={colors.text}
              />
            </View>
          </View>

          {/* Email */}
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
            isDark={isDark}
            tint={colors.tint}
            textColor={colors.text}
          />

          {/* Mobile */}
          <InputField
            label="Mobile number"
            icon="call-outline"
            placeholder="0917 123 4567"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={fields.contact}
            onChangeText={set('contact')}
            error={errors.contact}
            isDark={isDark}
            tint={colors.tint}
            textColor={colors.text}
            maxLength={16}
          />

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: isDark ? '#2C2C2E' : '#EDF1F5' }]} />

          {/* Password */}
          <InputField
            label="Password"
            icon="lock-closed-outline"
            placeholder="Min. 8 characters"
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            value={fields.password}
            onChangeText={set('password')}
            error={errors.password}
            isDark={isDark}
            tint={colors.tint}
            textColor={colors.text}
            right={
              <Pressable
                onPress={() => setShowPassword(v => !v)}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={isDark ? '#636366' : '#9AA6B2'}
                />
              </Pressable>
            }
          />

          {/* Confirm password */}
          <InputField
            label="Confirm password"
            icon="lock-closed-outline"
            placeholder="Re-enter your password"
            secureTextEntry={!showConfirm}
            textContentType="newPassword"
            value={fields.confirmPassword}
            onChangeText={set('confirmPassword')}
            error={errors.confirmPassword}
            isDark={isDark}
            tint={colors.tint}
            textColor={colors.text}
            right={
              <Pressable
                onPress={() => setShowConfirm(v => !v)}
                hitSlop={8}
                accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={isDark ? '#636366' : '#9AA6B2'}
                />
              </Pressable>
            }
          />

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.88 : 1 },
            ]}
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={styles.submitText}>Create account</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </Pressable>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: isDark ? '#636366' : '#9AA6B2' }]}>
              Already have an account?
            </Text>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Text style={[styles.footerLink, { color: colors.tint }]}> Log in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Hero
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heroText: {
    gap: 6,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '400',
  },

  // Card
  cardShell: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
    }),
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 16,
  },

  // Role selector
  section: {
    gap: 10,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  roleTrack: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Name row
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameHalf: {
    flex: 1,
  },

  // Divider
  divider: {
    height: 1,
    marginVertical: 4,
  },

  // Submit
  submitBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0a7ea4',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
    }),
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});
