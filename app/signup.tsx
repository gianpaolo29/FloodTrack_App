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
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/context/AuthContext';
import { AppAlert, AlertConfig } from '@/components/AppAlert';
import { colors } from '@/theme/colors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = SCREEN_H * 0.30;

const PH_MOBILE_RE = /^(\+639|09)\d{9}$/;
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Role = 'Resident' | 'Responder';

function Particle({ delay, x, y, size = 4 }: { delay: number; x: number; y: number; size?: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, { toValue: -50, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
            Animated.delay(1400),
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
    <Animated.View style={{
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.overlay.whiteHalf,
      opacity, transform: [{ translateY }],
    }} />
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  // ── Entrance animations ──────────────────────────────────────────────────
  const heroOpacity  = useRef(new Animated.Value(0)).current;
  const heroScale    = useRef(new Animated.Value(1.05)).current;
  const formOpacity  = useRef(new Animated.Value(0)).current;
  const formTransY   = useRef(new Animated.Value(50)).current;

  // Per-field slide-in (6 fields)
  const f1Opacity = useRef(new Animated.Value(0)).current;
  const f1TransX  = useRef(new Animated.Value(-30)).current;
  const f2Opacity = useRef(new Animated.Value(0)).current;
  const f2TransX  = useRef(new Animated.Value(-30)).current;
  const f3Opacity = useRef(new Animated.Value(0)).current;
  const f3TransX  = useRef(new Animated.Value(-30)).current;
  const f4Opacity = useRef(new Animated.Value(0)).current;
  const f4TransX  = useRef(new Animated.Value(-30)).current;
  const f5Opacity = useRef(new Animated.Value(0)).current;
  const f5TransX  = useRef(new Animated.Value(-30)).current;
  const f6Opacity = useRef(new Animated.Value(0)).current;
  const f6TransX  = useRef(new Animated.Value(-30)).current;

  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const btnScale      = useRef(new Animated.Value(0.85)).current;
  const socialOpacity = useRef(new Animated.Value(0)).current;
  const socialTransY  = useRef(new Animated.Value(15)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fieldPairs = [
      [f1Opacity, f1TransX], [f2Opacity, f2TransX], [f3Opacity, f3TransX],
      [f4Opacity, f4TransX], [f5Opacity, f5TransX], [f6Opacity, f6TransX],
    ] as [Animated.Value, Animated.Value][];

    Animated.stagger(60, [
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(heroScale,   { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ]),
      ...fieldPairs.map(([op, tx]) =>
        Animated.parallel([
          Animated.timing(op, { toValue: 1, duration: 340, useNativeDriver: true }),
          Animated.spring(tx,  { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
        ]),
      ),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(btnScale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(socialOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(socialTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.timing(footerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Form state ───────────────────────────────────────────────────────────
  const role: Role = 'Resident';
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [email, setEmail]                 = useState('');
  const [contact, setContact]             = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);

  const [fnFocus, setFnFocus]   = useState(false);
  const [lnFocus, setLnFocus]   = useState(false);
  const [emFocus, setEmFocus]   = useState(false);
  const [ctFocus, setCtFocus]   = useState(false);
  const [pwFocus, setPwFocus]   = useState(false);
  const [cpFocus, setCpFocus]   = useState(false);

  const [isLoading, setIsLoading]               = useState(false);
  const [isGoogleLoading, setIsGoogleLoading]   = useState(false);
  const [alertConfig, setAlertConfig]           = useState<AlertConfig | null>(null);

  // ── Password strength ────────────────────────────────────────────────────
  const pwdLen  = password.length;
  const strength = pwdLen === 0 ? 0 : pwdLen < 6 ? 1 : pwdLen < 10 ? 2 : 3;
  const strengthColors = [colors.dark.text, colors.feedback.error, colors.feedback.passwordMedium, colors.feedback.success];
  const strengthLabels = ['', 'Weak', 'Medium', 'Strong'];

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setAlertConfig({ type: 'warning', title: 'Missing Name', message: 'Please enter your first and last name.', confirmText: 'OK' });
      return;
    }
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setAlertConfig({ type: 'warning', title: 'Invalid Email', message: 'Please enter a valid email address.', confirmText: 'OK' });
      return;
    }
    const phone = contact.replace(/\s/g, '');
    if (!phone || !PH_MOBILE_RE.test(phone)) {
      setAlertConfig({ type: 'warning', title: 'Invalid Number', message: 'Enter a valid PH mobile number (09XX or +639XX).', confirmText: 'OK' });
      return;
    }
    if (!password || password.length < 8) {
      setAlertConfig({ type: 'warning', title: 'Weak Password', message: 'Password must be at least 8 characters.', confirmText: 'OK' });
      return;
    }
    if (confirmPassword !== password) {
      setAlertConfig({ type: 'warning', title: 'Passwords Don\'t Match', message: 'Please make sure both passwords are the same.', confirmText: 'OK' });
      return;
    }
    setIsLoading(true);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        contact: phone,
        password,
        role,
      });
    } catch (e: any) {
      setAlertConfig({ type: 'error', title: 'Registration Failed', message: e?.message ?? 'Something went wrong. Please try again.', confirmText: 'Try Again' });
    } finally {
      setIsLoading(false);
    }
  }, [firstName, lastName, email, contact, password, confirmPassword, role, register]);

  const handleGoogleSignUp = useCallback(async () => {
    setIsGoogleLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setAlertConfig({ type: 'info', title: 'Coming Soon', message: 'Google sign-up is not yet configured.', confirmText: 'OK' });
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function focusStyle(focused: boolean) {
    return focused ? s.inputFocused : undefined;
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
          <LinearGradient
            colors={colors.gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.hero, { paddingTop: insets.top + 12 }]}
          >
            <View style={[s.orb, s.orb1]} />
            <View style={[s.orb, s.orb2]} />
            <View style={[s.orb, s.orb3]} />

            <Particle delay={200}  x={SCREEN_W * 0.1}  y={40} size={3} />
            <Particle delay={800}  x={SCREEN_W * 0.85} y={60} size={4} />
            <Particle delay={1200} x={SCREEN_W * 0.4}  y={30} size={3} />

            <View style={s.logoBadge}>
              <View style={s.logoBadgeInner}>
                <Ionicons name="water" size={44} color={colors.white} />
              </View>
              <View style={s.logoBadgeRing} />
            </View>

            <Text style={s.logoTitle}>FLOODTRACK</Text>
            <Text style={s.logoSub}>Create your account</Text>
          </LinearGradient>

          <View style={s.waveWrap}>
            <LinearGradient
              colors={colors.gradients.wave}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={s.waveShape} />
          </View>
        </Animated.View>

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <Animated.View style={[s.formArea, { opacity: formOpacity, transform: [{ translateY: formTransY }] }]}>
          <ScrollView
            contentContainerStyle={[s.formScroll, { paddingBottom: insets.bottom + 36 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.titleRow}>
              <Text style={s.titleBold}>Create </Text>
              <Text style={s.titleLight}>account</Text>
            </View>
            <Text style={s.titleSub}>Fill in the details to get started</Text>

            {/* First + Last name */}
            <View style={s.nameRow}>
              <Animated.View style={[s.nameHalf, { opacity: f1Opacity, transform: [{ translateX: f1TransX }] }]}>
                <View style={[s.inputRow, fnFocus && s.inputFocused]}>
                  <View style={[s.inputIconWrap, fnFocus && s.inputIconActive]}>
                    <Ionicons name="person-outline" size={18} color={fnFocus ? colors.auth.primary : colors.auth.muted} />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="First name"
                    placeholderTextColor={colors.auth.placeholder}
                    autoCapitalize="words"
                    textContentType="givenName"
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={() => setFnFocus(true)}
                    onBlur={() => setFnFocus(false)}
                  />
                </View>
              </Animated.View>

              <Animated.View style={[s.nameHalf, { opacity: f2Opacity, transform: [{ translateX: f2TransX }] }]}>
                <View style={[s.inputRow, lnFocus && s.inputFocused]}>
                  <View style={[s.inputIconWrap, lnFocus && s.inputIconActive]}>
                    <Ionicons name="person-outline" size={18} color={lnFocus ? colors.auth.primary : colors.auth.muted} />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Last name"
                    placeholderTextColor={colors.auth.placeholder}
                    autoCapitalize="words"
                    textContentType="familyName"
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={() => setLnFocus(true)}
                    onBlur={() => setLnFocus(false)}
                  />
                </View>
              </Animated.View>
            </View>

            {/* Email */}
            <Animated.View style={[s.fieldWrap, { opacity: f3Opacity, transform: [{ translateX: f3TransX }] }]}>
              <View style={[s.inputRow, emFocus && s.inputFocused]}>
                <View style={[s.inputIconWrap, emFocus && s.inputIconActive]}>
                  <Ionicons name="mail-outline" size={18} color={emFocus ? colors.auth.primary : colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Email address"
                  placeholderTextColor={colors.auth.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmFocus(true)}
                  onBlur={() => setEmFocus(false)}
                />
              </View>
            </Animated.View>

            {/* Mobile */}
            <Animated.View style={[s.fieldWrap, { opacity: f4Opacity, transform: [{ translateX: f4TransX }] }]}>
              <View style={[s.inputRow, ctFocus && s.inputFocused]}>
                <View style={[s.inputIconWrap, ctFocus && s.inputIconActive]}>
                  <Ionicons name="call-outline" size={18} color={ctFocus ? colors.auth.primary : colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Mobile number (09XX)"
                  placeholderTextColor={colors.auth.placeholder}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  value={contact}
                  onChangeText={setContact}
                  maxLength={16}
                  onFocus={() => setCtFocus(true)}
                  onBlur={() => setCtFocus(false)}
                />
              </View>
            </Animated.View>

            {/* Password */}
            <Animated.View style={[s.fieldWrap, { opacity: f5Opacity, transform: [{ translateX: f5TransX }] }]}>
              <View style={[s.inputRow, pwFocus && s.inputFocused]}>
                <View style={[s.inputIconWrap, pwFocus && s.inputIconActive]}>
                  <Ionicons name="lock-closed-outline" size={18} color={pwFocus ? colors.auth.primary : colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Password (min. 8 chars)"
                  placeholderTextColor={colors.auth.placeholder}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPwFocus(true)}
                  onBlur={() => setPwFocus(false)}
                />
                <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.auth.muted} />
                </Pressable>
              </View>

              {password.length > 0 && (
                <View style={s.strengthRow}>
                  <View style={s.strengthTrack}>
                    {[1, 2, 3].map(i => (
                      <View key={i} style={[s.strengthBar, { backgroundColor: strength >= i ? strengthColors[strength] : colors.auth.inputIconBg }]} />
                    ))}
                  </View>
                  <Text style={[s.strengthLabel, { color: strengthColors[strength] }]}>{strengthLabels[strength]}</Text>
                </View>
              )}
            </Animated.View>

            {/* Confirm password */}
            <Animated.View style={[s.fieldWrap, { opacity: f6Opacity, transform: [{ translateX: f6TransX }] }]}>
              <View style={[s.inputRow, cpFocus && s.inputFocused]}>
                <View style={[s.inputIconWrap, cpFocus && s.inputIconActive]}>
                  <Ionicons name="lock-closed-outline" size={18} color={cpFocus ? colors.auth.primary : colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.auth.placeholder}
                  secureTextEntry={!showConfirm}
                  textContentType="newPassword"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setCpFocus(true)}
                  onBlur={() => setCpFocus(false)}
                />
                <Pressable onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn} hitSlop={8} accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.auth.muted} />
                </Pressable>
              </View>
            </Animated.View>

            {/* CTA */}
            <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnScale }] }}>
              <Pressable
                onPress={handleSubmit}
                disabled={isLoading || isGoogleLoading}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
              >
                <LinearGradient
                  colors={isLoading ? colors.gradients.ctaDisabled : colors.gradients.cta}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaBtn}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Text style={s.ctaBtnText}>Create Account</Text>
                      <View style={s.ctaBtnArrow}>
                        <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                      </View>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {/* Divider */}
            <Animated.View style={[s.dividerRow, { opacity: socialOpacity, transform: [{ translateY: socialTransY }] }]}>
              <View style={s.dividerLine} />
              <View style={s.dividerPill}>
                <Text style={s.dividerText}>or sign up with</Text>
              </View>
              <View style={s.dividerLine} />
            </Animated.View>

            {/* Google */}
            <Animated.View style={[s.socialRow, { opacity: socialOpacity, transform: [{ translateY: socialTransY }] }]}>
              <Pressable
                style={({ pressed }) => [s.socialBtn, s.googleBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                onPress={handleGoogleSignUp}
                disabled={isLoading || isGoogleLoading}
                accessibilityLabel="Sign up with Google"
              >
                {isGoogleLoading ? (
                  <ActivityIndicator size="small" color={colors.social.google} />
                ) : (
                  <>
                    <View style={s.googleIconCircle}>
                      <Text style={s.googleG}>G</Text>
                    </View>
                    <Text style={s.googleBtnText}>Google</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>

            {/* Footer */}
            <Animated.View style={[s.footer, { opacity: footerOpacity }]}>
              <Text style={s.footerText}>Already have an account?</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={s.footerLink}> Log In</Text>
              </Pressable>
            </Animated.View>

          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {alertConfig && (
        <AppAlert config={alertConfig} onDismiss={() => setAlertConfig(null)} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.auth.pageBg },
  flex: { flex: 1 },

  hero: {
    height: HERO_H,
    alignItems: 'center', justifyContent: 'center',
    paddingBottom: 36, overflow: 'hidden',
  },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin },
  orb1: { width: 200, height: 200, top: -60, right: -50 },
  orb2: { width: 140, height: 140, bottom: 10, left: -40, backgroundColor: colors.overlay.whiteSubtle },
  orb3: { width: 80, height: 80, top: 40, left: SCREEN_W * 0.55, backgroundColor: colors.overlay.whiteFaint },

  logoBadge: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoBadgeInner: {
    width: 80, height: 80, borderRadius: 26,
    backgroundColor: colors.overlay.whiteRegular,
    borderWidth: 1.5, borderColor: colors.overlay.whiteFirm,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeRing: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    borderWidth: 1, borderColor: colors.overlay.whiteLight,
  },
  logoTitle: { fontSize: 24, fontWeight: '900', color: colors.white, letterSpacing: 5 },
  logoSub: { fontSize: 12, color: colors.overlay.whiteSub, marginTop: 6, letterSpacing: 1 },

  waveWrap: { height: 55, position: 'relative', marginTop: -1 },
  waveShape: {
    position: 'absolute', bottom: 0,
    left: -12, right: -12, height: 60,
    backgroundColor: colors.auth.pageBg,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
  },

  formArea: { flex: 1, backgroundColor: colors.auth.pageBg, marginTop: -2 },
  formScroll: { paddingHorizontal: 28, paddingTop: 8 },

  titleRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  titleBold: { fontSize: 30, fontWeight: '800', color: colors.auth.heading },
  titleLight: { fontSize: 30, fontWeight: '300', color: colors.auth.heading },
  titleSub: { fontSize: 14, color: colors.auth.muted, marginBottom: 20 },

  nameRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  nameHalf: { flex: 1 },

  fieldWrap: { marginBottom: 14 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 16,
    backgroundColor: colors.auth.inputBg,
    borderWidth: 1.5, borderColor: 'transparent',
    paddingHorizontal: 4,
  },
  inputFocused: {
    backgroundColor: colors.white,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
  },
  inputIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.auth.inputIconBg,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  inputIconActive: { backgroundColor: colors.auth.inputIconActive },
  input: { flex: 1, fontSize: 15, color: colors.auth.heading, paddingHorizontal: 12, height: '100%' },
  eyeBtn: { paddingHorizontal: 12 },

  strengthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 8, paddingHorizontal: 2,
  },
  strengthTrack: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700' },

  ctaBtn: {
    height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 4,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 18, elevation: 10,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  ctaBtnArrow: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: colors.overlay.whiteBright,
    alignItems: 'center', justifyContent: 'center',
  },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 20, gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.auth.inputIconBg },
  dividerPill: {
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: colors.auth.inputBg, borderRadius: 20,
  },
  dividerText: { fontSize: 12, fontWeight: '600', color: colors.auth.muted },

  socialRow: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  socialBtn: {
    flex: 1, height: 52, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  googleBtn: {
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.auth.inputIconBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  googleIconCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.auth.inputBg,
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: 16, fontWeight: '800', color: colors.social.google },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: colors.auth.bodyText },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  footerText: { fontSize: 14, color: colors.auth.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: colors.auth.primary },
});
