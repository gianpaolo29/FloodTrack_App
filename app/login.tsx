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
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { colors as C } from '@/theme/colors';

export default function LoginScreen() {
  const router  = useRouter();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const insets  = useSafeAreaInsets();
  const { login } = useAuth();

  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [emailFocused,    setEmailFocused]    = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const cardBg    = isDark ? '#0D1117' : C.white;
  const inputBg   = isDark ? '#161B22' : C.slate[50];
  const textColor = isDark ? C.white   : C.slate[900];
  const subColor  = isDark ? C.slate[400] : C.slate[500];

  function inputBorder(focused: boolean) {
    return focused ? C.brand[500] : isDark ? '#21262D' : C.slate[200];
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── Brand hero ── */}
      <View style={[s.hero, { paddingTop: insets.top + 28, backgroundColor: C.brand[700] }]}>

        {/* Ripple rings behind logo */}
        <View style={s.ripple3} />
        <View style={s.ripple2} />
        <View style={s.ripple1} />

        {/* Logo mark */}
        <View style={s.logoMark}>
          <Ionicons name="water" size={32} color={C.white} />
        </View>

        <Text style={s.appName}>FloodTrack</Text>
        <Text style={s.tagline}>Community flood & hazard reporting</Text>
      </View>

      {/* Curved join */}
      <View style={[s.curve, { backgroundColor: cardBg }]} />

      {/* ── Form card ── */}
      <KeyboardAvoidingView
        style={[s.cardShell, { backgroundColor: cardBg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[s.form, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[s.formTitle, { color: textColor }]}>Welcome back</Text>
          <Text style={[s.formSub, { color: subColor }]}>Sign in to continue</Text>

          {/* Error banner */}
          {error && (
            <View style={s.errorBanner}>
              <View style={s.errorIcon}>
                <Ionicons name="alert-circle" size={16} color={C.severity.critical} />
              </View>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Email */}
          <View style={s.fieldGroup}>
            <Text style={[s.label, { color: subColor }]}>EMAIL ADDRESS</Text>
            <View style={[
              s.inputRow,
              { backgroundColor: inputBg, borderColor: inputBorder(emailFocused) },
              emailFocused && s.inputFocused,
            ]}>
              <View style={[s.inputIconWrap, emailFocused && { backgroundColor: C.brand[500] + '18' }]}>
                <Ionicons name="mail-outline" size={17} color={emailFocused ? C.brand[500] : C.slate[400]} />
              </View>
              <TextInput
                style={[s.input, { color: textColor }]}
                placeholder="you@example.com"
                placeholderTextColor={isDark ? '#3D444D' : C.slate[400]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={v => { setEmail(v); setError(null); }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={s.fieldGroup}>
            <View style={s.labelRow}>
              <Text style={[s.label, { color: subColor }]}>PASSWORD</Text>
              <Pressable accessibilityRole="button" hitSlop={8}>
                <Text style={[s.forgotLink, { color: C.brand[500] }]}>Forgot?</Text>
              </Pressable>
            </View>
            <View style={[
              s.inputRow,
              { backgroundColor: inputBg, borderColor: inputBorder(passwordFocused) },
              passwordFocused && s.inputFocused,
            ]}>
              <View style={[s.inputIconWrap, passwordFocused && { backgroundColor: C.brand[500] + '18' }]}>
                <Ionicons name="lock-closed-outline" size={17} color={passwordFocused ? C.brand[500] : C.slate[400]} />
              </View>
              <TextInput
                style={[s.input, { color: textColor }]}
                placeholder="••••••••"
                placeholderTextColor={isDark ? '#3D444D' : C.slate[400]}
                secureTextEntry={!showPassword}
                textContentType="password"
                value={password}
                onChangeText={v => { setPassword(v); setError(null); }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8} style={s.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={C.slate[400]}
                />
              </Pressable>
            </View>
          </View>

          {/* Login button */}
          <Pressable
            style={({ pressed }) => [
              s.btn,
              { backgroundColor: C.brand[500] },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
              loading && { opacity: 0.7 },
            ]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Log in"
          >
            {loading
              ? <ActivityIndicator color={C.white} />
              : (
                <>
                  <Text style={s.btnText}>Log in</Text>
                  <View style={s.btnArrow}>
                    <Ionicons name="arrow-forward" size={16} color={C.white} />
                  </View>
                </>
              )
            }
          </Pressable>

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={[s.dividerLine, { backgroundColor: isDark ? '#21262D' : C.slate[100] }]} />
            <Text style={[s.dividerText, { color: subColor }]}>or</Text>
            <View style={[s.dividerLine, { backgroundColor: isDark ? '#21262D' : C.slate[100] }]} />
          </View>

          {/* Sign up link */}
          <View style={s.footer}>
            <Text style={[s.footerText, { color: subColor }]}>Don't have an account?</Text>
            <Pressable onPress={() => router.push('/signup')} hitSlop={8} accessibilityRole="link">
              <Text style={[s.footerLink, { color: C.brand[500] }]}> Sign up</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.brand[700] },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingBottom: 60,
    gap: 8,
    overflow: 'hidden',
  },
  ripple3: {
    position: 'absolute',
    width: 240, height: 240, borderRadius: 120,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    top: '50%', left: '50%',
    marginTop: -120, marginLeft: -120,
  },
  ripple2: {
    position: 'absolute',
    width: 170, height: 170, borderRadius: 85,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.10)',
    top: '50%', left: '50%',
    marginTop: -85, marginLeft: -85,
  },
  ripple1: {
    position: 'absolute',
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: '50%', left: '50%',
    marginTop: -52, marginLeft: -52,
  },
  logoMark: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: C.brand[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
    zIndex: 1,
  },
  appName: {
    fontSize: 30, fontWeight: '800', color: C.white,
    letterSpacing: -0.5, zIndex: 1,
  },
  tagline: {
    fontSize: 13, color: 'rgba(255,255,255,0.60)',
    zIndex: 1,
  },

  // ── Curve ──
  curve: {
    height: 36,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -36,
  },

  // ── Card ──
  cardShell: { flex: 1 },
  form: {
    paddingHorizontal: 24,
    paddingTop: 4,
    gap: 16,
  },
  formTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  formSub:   { fontSize: 14, marginTop: -8 },

  // Error
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

  // Fields
  fieldGroup: { gap: 6 },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontSize: 10, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginLeft: 2,
  },
  forgotLink: { fontSize: 12, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 14, borderWidth: 1.5,
    paddingRight: 14, gap: 10, overflow: 'hidden',
  },
  inputFocused: {
    borderWidth: 2,
    shadowColor: C.brand[500],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 2,
  },
  inputIconWrap: {
    width: 52, height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  eyeBtn: { padding: 4 },

  // Button
  btn: {
    height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
    shadowColor: C.brand[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  btnText:  { color: C.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  btnArrow: {
    position: 'absolute', right: 18,
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: -4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '500' },

  // Footer
  footer:     { flexDirection: 'row', justifyContent: 'center', paddingTop: 4 },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '700' },
});
