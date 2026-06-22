import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

// ─── Validation helpers ────────────────────────────────────────────────────────

const PH_MOBILE_RE = /^(\+639|09)\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm(fields: FormFields): FormErrors {
  const errors: FormErrors = {};

  if (!fields.firstName.trim()) errors.firstName = 'First name is required.';
  if (!fields.lastName.trim()) errors.lastName = 'Last name is required.';

  if (!fields.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_RE.test(fields.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  const phone = fields.contact.replace(/\s/g, '');
  if (!phone) {
    errors.contact = 'Contact number is required.';
  } else if (!PH_MOBILE_RE.test(phone)) {
    errors.contact = 'Invalid PH number.';
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

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SignUpScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';

  const [fields, setFields] = useState<FormFields>({
    firstName: '',
    lastName: '',
    email: '',
    contact: '',
    password: '',
    confirmPassword: '',
  });

  const [focused, setFocused] = useState<Partial<Record<keyof FormFields, boolean>>>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function set(key: keyof FormFields) {
    return (value: string) => {
      setFields(prev => ({ ...prev, [key]: value }));
      if (submitted) {
        setErrors(prev => ({ ...prev, [key]: undefined }));
      }
    };
  }

  function handleSubmit() {
    setSubmitted(true);
    const errs = validateForm(fields);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    router.replace('/(tabs)');
  }

  const inputStyle = (key: keyof FormFields) => [
    styles.input,
    {
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      borderColor: errors[key] ? '#FF453A' : focused[key] ? colors.tint : isDark ? '#38383A' : '#E5E5EA',
      color: colors.text,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Join FloodTrack</Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Stay informed and stay safe.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={[styles.label, { color: colors.text }]}>First Name</Text>
              <TextInput
                style={inputStyle('firstName')}
                placeholder="Juan"
                placeholderTextColor={isDark ? '#545456' : '#AEAEB2'}
                value={fields.firstName}
                onChangeText={set('firstName')}
                onFocus={() => setFocused(p => ({ ...p, firstName: true }))}
                onBlur={() => setFocused(p => ({ ...p, firstName: false }))}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.label, { color: colors.text }]}>Last Name</Text>
              <TextInput
                style={inputStyle('lastName')}
                placeholder="Dela Cruz"
                placeholderTextColor={isDark ? '#545456' : '#AEAEB2'}
                value={fields.lastName}
                onChangeText={set('lastName')}
                onFocus={() => setFocused(p => ({ ...p, lastName: true }))}
                onBlur={() => setFocused(p => ({ ...p, lastName: false }))}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
            <TextInput
              style={inputStyle('email')}
              placeholder="name@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={fields.email}
              onChangeText={set('email')}
              onFocus={() => setFocused(p => ({ ...p, email: true }))}
              onBlur={() => setFocused(p => ({ ...p, email: false }))}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Mobile Number</Text>
            <TextInput
              style={inputStyle('contact')}
              placeholder="0917 123 4567"
              keyboardType="phone-pad"
              value={fields.contact}
              onChangeText={set('contact')}
              onFocus={() => setFocused(p => ({ ...p, contact: true }))}
              onBlur={() => setFocused(p => ({ ...p, contact: false }))}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <TextInput
              style={inputStyle('password')}
              secureTextEntry
              placeholder="••••••••"
              value={fields.password}
              onChangeText={set('password')}
              onFocus={() => setFocused(p => ({ ...p, password: true }))}
              onBlur={() => setFocused(p => ({ ...p, password: false }))}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Confirm Password</Text>
            <TextInput
              style={inputStyle('confirmPassword')}
              secureTextEntry
              placeholder="••••••••"
              value={fields.confirmPassword}
              onChangeText={set('confirmPassword')}
              onFocus={() => setFocused(p => ({ ...p, confirmPassword: true }))}
              onBlur={() => setFocused(p => ({ ...p, confirmPassword: false }))}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={handleSubmit}
          >
            <Text style={styles.buttonText}>Create Account</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.icon }]}>Already have an account?</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.link, { color: colors.tint }]}> Log in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  backButton: { width: 40, height: 40, justifyContent: 'center', marginLeft: -8, marginBottom: 20 },
  header: { marginBottom: 40 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { fontSize: 16, marginTop: 4, fontWeight: '400' },
  form: { gap: 20 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1, gap: 8 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', marginLeft: 4 },
  input: {
    height: 54,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  buttonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { fontSize: 15 },
  link: { fontSize: 15, fontWeight: '700' },
});
