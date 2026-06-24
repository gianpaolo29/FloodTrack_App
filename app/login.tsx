/**
 * Login screen — premium animated redesign
 *
 * Flow: Splash animation (logo reveal + tagline) → login form slides up
 * Features: Animated water ripple, staggered field entries, interactive focus
 * states, password toggle, loading spinner, smooth transitions
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
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
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Animated water ripple (decorative) ─────────────────────────────────────

function WaterRipple({ delay, size, color }: { delay: number; size: number; color: string }) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 3000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 3000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity, delay]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5, borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

// ─── Floating particle ──────────────────────────────────────────────────────

function FloatingDot({ delay, x, y }: { delay: number; x: number; y: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, { toValue: -40, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
            Animated.delay(900),
            Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
        ]),
        Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [translateY, opacity, delay]);

  return (
    <Animated.View
      style={{
        position: 'absolute', left: x, top: y,
        width: 4, height: 4, borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.6)',
        opacity, transform: [{ translateY }],
      }}
    />
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { login } = useAuth();

  // ── Splash animation values ──
  const [showSplash, setShowSplash] = useState(true);
  const splashLogoScale    = useRef(new Animated.Value(0.3)).current;
  const splashLogoOpacity  = useRef(new Animated.Value(0)).current;
  const splashLogoRotate   = useRef(new Animated.Value(0)).current;
  const splashTextOpacity  = useRef(new Animated.Value(0)).current;
  const splashTextTransY   = useRef(new Animated.Value(20)).current;
  const splashSubOpacity   = useRef(new Animated.Value(0)).current;
  const splashSubTransY    = useRef(new Animated.Value(15)).current;
  const splashBgOpacity    = useRef(new Animated.Value(1)).current;
  const splashShimmer      = useRef(new Animated.Value(0)).current;

  // ── Login form animation values ──
  const formOpacity   = useRef(new Animated.Value(0)).current;
  const formTransY    = useRef(new Animated.Value(60)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTransY  = useRef(new Animated.Value(-30)).current;
  const field1TransX  = useRef(new Animated.Value(-40)).current;
  const field1Opacity = useRef(new Animated.Value(0)).current;
  const field2TransX  = useRef(new Animated.Value(-40)).current;
  const field2Opacity = useRef(new Animated.Value(0)).current;
  const btnScale      = useRef(new Animated.Value(0.8)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  // ── Form state ──
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [emailFocus, setEmailFocus]     = useState(false);
  const [pwdFocus, setPwdFocus]         = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');

  // Animated focus glow
  const emailGlow = useRef(new Animated.Value(0)).current;
  const pwdGlow   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(emailGlow, {
      toValue: emailFocus ? 1 : 0,
      duration: 200, useNativeDriver: false,
    }).start();
  }, [emailFocus, emailGlow]);

  useEffect(() => {
    Animated.timing(pwdGlow, {
      toValue: pwdFocus ? 1 : 0,
      duration: 200, useNativeDriver: false,
    }).start();
  }, [pwdFocus, pwdGlow]);

  // ── Run splash → form sequence ──
  useEffect(() => {
    // Phase 1: Splash
    Animated.sequence([
      // Logo appears with spring
      Animated.parallel([
        Animated.spring(splashLogoScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(splashLogoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(splashLogoRotate,  { toValue: 1, duration: 800, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]),
      // Shimmer across logo
      Animated.timing(splashShimmer, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      // App name fades in
      Animated.parallel([
        Animated.timing(splashTextOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(splashTextTransY,  { toValue: 0, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      // Tagline
      Animated.parallel([
        Animated.timing(splashSubOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(splashSubTransY,  { toValue: 0, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      // Hold
      Animated.delay(600),
      // Fade out splash
      Animated.timing(splashBgOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      setShowSplash(false);
      // Phase 2: Form entrance
      Animated.stagger(100, [
        // Header slides down
        Animated.parallel([
          Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(headerTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        ]),
        // Form card slides up
        Animated.parallel([
          Animated.timing(formOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        ]),
        // Email field slides in
        Animated.parallel([
          Animated.timing(field1Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(field1TransX,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        ]),
        // Password field slides in
        Animated.parallel([
          Animated.timing(field2Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(field2TransX,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        ]),
        // Button pops in
        Animated.parallel([
          Animated.spring(btnScale,  { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
          Animated.timing(btnOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        // Footer fades
        Animated.timing(footerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  // ── Login handler ──
  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter your email and password.');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, login]);

  // ── Derived colors ──
  const emailBorderColor = emailGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? colors.dark.border : colors.slate[200], colors.brand[500]],
  });
  const pwdBorderColor = pwdGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? colors.dark.border : colors.slate[200], colors.brand[500]],
  });

  const splashRotateStr = splashLogoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-15deg', '0deg'],
  });

  const shimmerTranslateX = splashShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 200],
  });

  const cardBg   = isDark ? colors.dark.surface : colors.white;
  const screenBg = isDark ? colors.dark.bg : '#EDF2F7';
  const fieldBg  = isDark ? colors.dark.card : '#F7F9FB';
  const textMain = isDark ? colors.white : colors.slate[900];
  const textSub  = isDark ? colors.slate[500] : colors.slate[400];

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>
      <StatusBar style="light" />

      {/* ══════════════════════════════════════════════════════════════════════
          SPLASH ANIMATION OVERLAY
          ══════════════════════════════════════════════════════════════════════ */}
      {showSplash && (
        <Animated.View style={[s.splashOverlay, { opacity: splashBgOpacity }]}>
          {/* Water ripple effects */}
          <View style={s.rippleContainer}>
            <WaterRipple delay={0}    size={200} color="rgba(255,255,255,0.12)" />
            <WaterRipple delay={1000} size={280} color="rgba(255,255,255,0.08)" />
            <WaterRipple delay={2000} size={360} color="rgba(255,255,255,0.05)" />
          </View>

          {/* Floating particles */}
          <FloatingDot delay={200}  x={SCREEN_W * 0.15} y={SCREEN_H * 0.35} />
          <FloatingDot delay={600}  x={SCREEN_W * 0.75} y={SCREEN_H * 0.4} />
          <FloatingDot delay={1000} x={SCREEN_W * 0.3}  y={SCREEN_H * 0.55} />
          <FloatingDot delay={1400} x={SCREEN_W * 0.65} y={SCREEN_H * 0.3} />
          <FloatingDot delay={800}  x={SCREEN_W * 0.5}  y={SCREEN_H * 0.6} />

          {/* Logo icon */}
          <Animated.View style={[
            s.splashLogoWrap,
            {
              opacity: splashLogoOpacity,
              transform: [
                { scale: splashLogoScale },
                { rotate: splashRotateStr },
              ],
            },
          ]}>
            <View style={s.splashLogoCircle}>
              <Ionicons name="water" size={44} color={colors.white} />
              {/* Shimmer overlay */}
              <Animated.View style={[
                s.shimmer,
                { transform: [{ translateX: shimmerTranslateX }] },
              ]} />
            </View>
          </Animated.View>

          {/* App name */}
          <Animated.Text style={[
            s.splashTitle,
            {
              opacity: splashTextOpacity,
              transform: [{ translateY: splashTextTransY }],
            },
          ]}>
            FloodTrack
          </Animated.Text>

          {/* Tagline */}
          <Animated.Text style={[
            s.splashSub,
            {
              opacity: splashSubOpacity,
              transform: [{ translateY: splashSubTransY }],
            },
          ]}>
            Real-time flood monitoring & alerts
          </Animated.Text>

          {/* Version badge */}
          <Animated.View style={[s.splashVersion, { opacity: splashSubOpacity }]}>
            <Text style={s.splashVersionText}>v1.0.0</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LOGIN FORM
          ══════════════════════════════════════════════════════════════════════ */}
      {!showSplash && (
        <KeyboardAvoidingView
          style={s.formContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Hero header (brand gradient area) ── */}
          <Animated.View style={[
            s.heroHeader,
            {
              paddingTop: insets.top + 16,
              opacity: headerOpacity,
              transform: [{ translateY: headerTransY }],
            },
          ]}>
            {/* Decorative ripples */}
            <View style={s.heroRipples}>
              <WaterRipple delay={0}    size={120} color="rgba(255,255,255,0.08)" />
              <WaterRipple delay={1500} size={180} color="rgba(255,255,255,0.05)" />
            </View>

            <View style={s.heroLogoRow}>
              <View style={s.heroLogoCircle}>
                <Ionicons name="water" size={24} color={colors.white} />
              </View>
              <View>
                <Text style={s.heroAppName}>FloodTrack</Text>
                <Text style={s.heroTagline}>Sign in to continue</Text>
              </View>
            </View>

            {/* Wave separator */}
            <View style={[s.waveSeparator, { backgroundColor: cardBg }]} />
          </Animated.View>

          {/* ── Form card ── */}
          <Animated.View style={[
            s.formCard,
            {
              backgroundColor: cardBg,
              opacity: formOpacity,
              transform: [{ translateY: formTransY }],
            },
          ]}>
            <ScrollView
              contentContainerStyle={[s.formScroll, { paddingBottom: insets.bottom + 24 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Welcome text */}
              <View style={s.welcomeSection}>
                <Text style={[s.welcomeTitle, { color: textMain }]}>Welcome back</Text>
                <Text style={[s.welcomeSub, { color: textSub }]}>
                  Enter your credentials to access your account
                </Text>
              </View>

              {/* Error message */}
              {errorMsg ? (
                <View style={s.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.severity.critical} />
                  <Text style={s.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Email field */}
              <Animated.View style={{
                opacity: field1Opacity,
                transform: [{ translateX: field1TransX }],
              }}>
                <Text style={[s.fieldLabel, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                  Email address
                </Text>
                <Animated.View style={[
                  s.inputRow,
                  { backgroundColor: fieldBg, borderColor: emailBorderColor },
                  emailFocus && s.inputRowFocused,
                ]}>
                  <View style={[
                    s.inputIcon,
                    { backgroundColor: emailFocus ? colors.brand[500] + '18' : isDark ? colors.dark.elevated : colors.slate[100] },
                  ]}>
                    <Ionicons
                      name="mail"
                      size={16}
                      color={emailFocus ? colors.brand[500] : isDark ? colors.slate[500] : colors.slate[400]}
                    />
                  </View>
                  <TextInput
                    style={[s.input, { color: textMain }]}
                    placeholder="you@example.com"
                    placeholderTextColor={isDark ? colors.slate[600] : colors.slate[300]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={t => { setEmail(t); setErrorMsg(''); }}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                  />
                </Animated.View>
              </Animated.View>

              {/* Password field */}
              <Animated.View style={{
                opacity: field2Opacity,
                transform: [{ translateX: field2TransX }],
              }}>
                <Text style={[s.fieldLabel, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>
                  Password
                </Text>
                <Animated.View style={[
                  s.inputRow,
                  { backgroundColor: fieldBg, borderColor: pwdBorderColor },
                  pwdFocus && s.inputRowFocused,
                ]}>
                  <View style={[
                    s.inputIcon,
                    { backgroundColor: pwdFocus ? colors.brand[500] + '18' : isDark ? colors.dark.elevated : colors.slate[100] },
                  ]}>
                    <Ionicons
                      name="lock-closed"
                      size={16}
                      color={pwdFocus ? colors.brand[500] : isDark ? colors.slate[500] : colors.slate[400]}
                    />
                  </View>
                  <TextInput
                    style={[s.input, { color: textMain }]}
                    placeholder="Enter your password"
                    placeholderTextColor={isDark ? colors.slate[600] : colors.slate[300]}
                    secureTextEntry={!showPwd}
                    textContentType="password"
                    value={password}
                    onChangeText={t => { setPassword(t); setErrorMsg(''); }}
                    onFocus={() => setPwdFocus(true)}
                    onBlur={() => setPwdFocus(false)}
                  />
                  <Pressable
                    onPress={() => setShowPwd(v => !v)}
                    style={s.eyeBtn}
                    hitSlop={8}
                    accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showPwd ? 'eye-off' : 'eye'}
                      size={18}
                      color={isDark ? colors.slate[500] : colors.slate[400]}
                    />
                  </Pressable>
                </Animated.View>

                {/* Forgot password */}
                <Pressable style={s.forgotBtn} hitSlop={6}>
                  <Text style={[s.forgotText, { color: colors.brand[500] }]}>Forgot password?</Text>
                </Pressable>
              </Animated.View>

              {/* Login button */}
              <Animated.View style={{
                opacity: btnOpacity,
                transform: [{ scale: btnScale }],
              }}>
                <Pressable
                  style={({ pressed }) => [
                    s.loginBtn,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                    isLoading && { opacity: 0.7 },
                  ]}
                  onPress={handleLogin}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Log in"
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Text style={s.loginBtnText}>Sign in</Text>
                      <View style={s.loginBtnArrow}>
                        <Ionicons name="arrow-forward" size={16} color={colors.brand[500]} />
                      </View>
                    </>
                  )}
                </Pressable>
              </Animated.View>

              {/* Divider */}
              <View style={s.dividerRow}>
                <View style={[s.dividerLine, { backgroundColor: isDark ? colors.dark.border : colors.slate[200] }]} />
                <Text style={[s.dividerText, { color: textSub }]}>or</Text>
                <View style={[s.dividerLine, { backgroundColor: isDark ? colors.dark.border : colors.slate[200] }]} />
              </View>

              {/* Sign up footer */}
              <Animated.View style={[s.footer, { opacity: footerOpacity }]}>
                <Text style={[s.footerText, { color: textSub }]}>
                  Don't have an account?
                </Text>
                <Pressable
                  onPress={() => router.push('/signup')}
                  style={({ pressed }) => [
                    s.signupBtn,
                    { borderColor: isDark ? colors.dark.border : colors.slate[200] },
                    pressed && { backgroundColor: isDark ? colors.dark.card : colors.slate[50] },
                  ]}
                  accessibilityRole="link"
                >
                  <Ionicons name="person-add-outline" size={14} color={colors.brand[500]} />
                  <Text style={[s.signupBtnText, { color: colors.brand[500] }]}>Create account</Text>
                </Pressable>
              </Animated.View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Splash ──
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  rippleContainer: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
    width: 360, height: 360,
  },
  splashLogoWrap: { marginBottom: 20, alignItems: 'center' },
  splashLogoCircle: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute', top: 0, bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    transform: [{ skewX: '-20deg' }],
  },
  splashTitle: {
    fontSize: 34, fontWeight: '900', color: colors.white,
    letterSpacing: -0.5, textAlign: 'center',
  },
  splashSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', marginTop: 6,
  },
  splashVersion: {
    position: 'absolute', bottom: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
  },
  splashVersionText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },

  // ── Form container ──
  formContainer: { flex: 1 },

  // ── Hero header ──
  heroHeader: {
    backgroundColor: colors.brand[500],
    paddingHorizontal: 24,
    paddingBottom: 48,
    position: 'relative',
    overflow: 'hidden',
  },
  heroRipples: {
    position: 'absolute', right: -40, top: -40,
    width: 200, height: 200,
    alignItems: 'center', justifyContent: 'center',
  },
  heroLogoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 8,
  },
  heroLogoCircle: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  heroAppName: {
    fontSize: 22, fontWeight: '900', color: colors.white,
    letterSpacing: -0.3,
  },
  heroTagline: {
    fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 1,
  },
  waveSeparator: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 28,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },

  // ── Form card ──
  formCard: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
  formScroll: {
    paddingHorizontal: 24, paddingTop: 28, gap: 18,
  },

  // Welcome
  welcomeSection: { gap: 4, marginBottom: 4 },
  welcomeTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  welcomeSub:   { fontSize: 14, lineHeight: 20 },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.severity.critical + '0E',
    borderWidth: 1, borderColor: colors.severity.critical + '25',
    borderRadius: 12, padding: 12,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.severity.critical, fontWeight: '500' },

  // Fields
  fieldLabel: {
    fontSize: 12, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8, marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 16,
    borderWidth: 1.5, paddingHorizontal: 4, gap: 0,
  },
  inputRowFocused: {
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  inputIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  input: {
    flex: 1, fontSize: 15, height: '100%',
    paddingHorizontal: 10,
  },
  eyeBtn: { paddingHorizontal: 12 },

  // Forgot
  forgotBtn: { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { fontSize: 13, fontWeight: '600' },

  // Login button
  loginBtn: {
    height: 56, borderRadius: 16,
    backgroundColor: colors.brand[500],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  loginBtnText: {
    color: colors.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.2,
  },
  loginBtnArrow: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: '500' },

  // Footer
  footer: { alignItems: 'center', gap: 14 },
  footerText: { fontSize: 14 },
  signupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, width: '100%',
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5,
  },
  signupBtnText: { fontSize: 15, fontWeight: '700' },
});
