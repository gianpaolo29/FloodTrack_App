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
import { colors } from '@/theme/colors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = SCREEN_H * 0.30;

const PH_MOBILE_RE = /^(\+639|09)\d{9}$/;
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormFields {
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  password: string;
  confirmPassword: string;
}
type FormErrors = Partial<Record<keyof FormFields, string>>;

function validateForm(f: FormFields): FormErrors {
  const e: FormErrors = {};
  if (!f.firstName.trim()) e.firstName = 'Required';
  if (!f.lastName.trim())  e.lastName  = 'Required';
  if (!f.email.trim()) e.email = 'Email is required';
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email';
  const phone = f.contact.replace(/\s/g, '');
  if (!phone) e.contact = 'Contact number is required';
  else if (!PH_MOBILE_RE.test(phone)) e.contact = 'Must be 09XX or +639XX format';
  if (!f.password) e.password = 'Password is required';
  else if (f.password.length < 8) e.password = 'Min. 8 characters';
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords don\'t match';
  return e;
}

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

function AnimatedField({
  label, icon, error, placeholder, right, animDelay = 0, ...inputProps
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  placeholder: string;
  right?: React.ReactNode;
  animDelay?: number;
} & Omit<React.ComponentProps<typeof TextInput>, 'style'>) {
  const [focused, setFocused] = useState(false);
  const slideX  = useRef(new Animated.Value(-35)).current;
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const glowVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(animDelay),
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideX, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(glowVal, { toValue: focused ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [focused]);

  const borderColor = error
    ? colors.feedback.error
    : glowVal.interpolate({ inputRange: [0, 1], outputRange: ['transparent', colors.auth.primary] });

  return (
    <Animated.View style={[fi.wrap, { opacity: fadeIn, transform: [{ translateX: slideX }] }]}>
      <Text style={fi.label}>{label}</Text>
      <Animated.View style={[
        fi.row,
        { borderColor },
        focused && fi.rowFocused,
        error ? fi.rowError : null,
      ]}>
        <View style={[fi.iconWrap, focused && fi.iconActive, error ? fi.iconError : null]}>
          <Ionicons
            name={icon}
            size={17}
            color={error ? colors.feedback.error : focused ? colors.auth.primary : colors.auth.muted}
          />
        </View>
        <TextInput
          style={fi.input}
          placeholder={placeholder}
          placeholderTextColor={colors.auth.placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {right}
      </Animated.View>
      {error ? (
        <View style={fi.errRow}>
          <Ionicons name="alert-circle" size={12} color={colors.feedback.error} />
          <Text style={fi.errText}>{error}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const fi = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, color: colors.auth.tertiary, marginBottom: 7, marginLeft: 2,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    height: 54, borderRadius: 16,
    backgroundColor: colors.auth.inputBg,
    borderWidth: 1.5, borderColor: 'transparent',
    paddingHorizontal: 4,
  },
  rowFocused: {
    backgroundColor: colors.white,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  rowError: {
    backgroundColor: colors.feedback.errorBg,
    borderColor: colors.feedback.errorBorder,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: colors.auth.inputIconBg,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  iconActive: { backgroundColor: colors.auth.inputIconActive },
  iconError:  { backgroundColor: colors.feedback.errorBorder },
  input: {
    flex: 1, fontSize: 15, color: colors.auth.heading,
    paddingHorizontal: 11, height: '100%',
  },
  errRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, marginTop: 6, marginLeft: 4,
  },
  errText: { fontSize: 11, color: colors.feedback.error, fontWeight: '600' },
});

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const heroOpacity   = useRef(new Animated.Value(0)).current;
  const heroScale     = useRef(new Animated.Value(1.05)).current;
  const formOpacity   = useRef(new Animated.Value(0)).current;
  const formTransY    = useRef(new Animated.Value(50)).current;
  const titleOpacity  = useRef(new Animated.Value(0)).current;
  const titleTransY   = useRef(new Animated.Value(20)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const btnScale      = useRef(new Animated.Value(0.85)).current;
  const socialOpacity = useRef(new Animated.Value(0)).current;
  const socialTransY  = useRef(new Animated.Value(15)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(heroScale,   { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(titleTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
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

  const [fields, setFields] = useState<FormFields>({
    firstName: '', lastName: '', email: '',
    contact: '', password: '', confirmPassword: '',
  });
  const role: Role = 'Resident';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [errors, setErrors]             = useState<FormErrors>({});
  const [submitted, setSubmitted]       = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  function set(key: keyof FormFields) {
    return (value: string) => {
      setFields(prev => ({ ...prev, [key]: value }));
      if (submitted) setErrors(prev => ({ ...prev, [key]: undefined }));
    };
  }

  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
    const errs = validateForm(fields);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setIsLoading(true);
    try {
      await register({
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        email: fields.email.trim(),
        contact: fields.contact.replace(/\s/g, ''),
        password: fields.password,
        role,
      });
    } catch (e: any) {
      setErrors({ email: e?.message ?? 'Registration failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  }, [fields, role, register]);

  const handleGoogleSignUp = useCallback(async () => {
    setIsGoogleLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setErrors({ email: 'Google sign-up is not yet configured.' });
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  const pwdLen = fields.password.length;
  const strength = pwdLen === 0 ? 0 : pwdLen < 6 ? 1 : pwdLen < 10 ? 2 : 3;
  const strengthColors = [colors.dark.text, colors.feedback.error, colors.feedback.passwordMedium, colors.feedback.success];
  const strengthLabels = ['', 'Weak', 'Medium', 'Strong'];

  const FIELD_BASE = 500;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
          <LinearGradient
            colors={colors.gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.hero, { paddingTop: insets.top + 8 }]}
          >
            <View style={[s.orb, s.orb1]} />
            <View style={[s.orb, s.orb2]} />

            <Particle delay={200}  x={SCREEN_W * 0.08} y={20} size={3} />
            <Particle delay={800}  x={SCREEN_W * 0.88} y={35} size={4} />
            <Particle delay={1400} x={SCREEN_W * 0.5}  y={15} size={3} />

            <Pressable
              onPress={() => router.back()}
              style={s.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={20} color={colors.overlay.whiteNear} />
            </Pressable>

            <View style={s.heroContent}>
              <View style={s.heroBadge}>
                <Ionicons name="person-add" size={28} color={colors.white} />
              </View>
              <Text style={s.heroTitle}>Join FloodTrack</Text>
              <Text style={s.heroSub}>Create your account in seconds</Text>
            </View>
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

        <Animated.View style={[s.formArea, { opacity: formOpacity, transform: [{ translateY: formTransY }] }]}>
          <ScrollView
            contentContainerStyle={[s.formScroll, { paddingBottom: insets.bottom + 36 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTransY }] }}>
              <View style={s.titleRow}>
                <Text style={s.titleBold}>Create </Text>
                <Text style={s.titleLight}>account</Text>
              </View>
              <Text style={s.titleSub}>Fill in the details to get started</Text>
            </Animated.View>

            <View style={s.nameRow}>
              <View style={s.nameHalf}>
                <AnimatedField
                  label="First name"
                  icon="person-outline"
                  placeholder="Juan"
                  autoCapitalize="words"
                  textContentType="givenName"
                  value={fields.firstName}
                  onChangeText={set('firstName')}
                  error={errors.firstName}
                  animDelay={FIELD_BASE}
                />
              </View>
              <View style={s.nameHalf}>
                <AnimatedField
                  label="Last name"
                  icon="person-outline"
                  placeholder="Dela Cruz"
                  autoCapitalize="words"
                  textContentType="familyName"
                  value={fields.lastName}
                  onChangeText={set('lastName')}
                  error={errors.lastName}
                  animDelay={FIELD_BASE + 60}
                />
              </View>
            </View>

            <AnimatedField
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
              animDelay={FIELD_BASE + 120}
            />

            <AnimatedField
              label="Mobile number"
              icon="call-outline"
              placeholder="0917 123 4567"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              value={fields.contact}
              onChangeText={set('contact')}
              error={errors.contact}
              maxLength={16}
              animDelay={FIELD_BASE + 180}
            />

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <View style={s.dividerPill}>
                <Ionicons name="lock-closed" size={11} color={colors.auth.muted} />
                <Text style={s.dividerText}>Security</Text>
              </View>
              <View style={s.dividerLine} />
            </View>

            <AnimatedField
              label="Password"
              icon="lock-closed-outline"
              placeholder="Min. 8 characters"
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              value={fields.password}
              onChangeText={set('password')}
              error={errors.password}
              animDelay={FIELD_BASE + 240}
              right={
                <Pressable
                  onPress={() => setShowPassword(v => !v)}
                  style={s.eyeBtn}
                  hitSlop={8}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.auth.muted} />
                </Pressable>
              }
            />

            {fields.password.length > 0 && (
              <View style={s.strengthRow}>
                <View style={s.strengthTrack}>
                  {[1, 2, 3].map(i => (
                    <View
                      key={i}
                      style={[
                        s.strengthBar,
                        { backgroundColor: strength >= i ? strengthColors[strength] : colors.auth.inputIconBg },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[s.strengthLabel, { color: strengthColors[strength] }]}>
                  {strengthLabels[strength]}
                </Text>
              </View>
            )}

            <AnimatedField
              label="Confirm password"
              icon="lock-closed-outline"
              placeholder="Re-enter password"
              secureTextEntry={!showConfirm}
              textContentType="newPassword"
              value={fields.confirmPassword}
              onChangeText={set('confirmPassword')}
              error={errors.confirmPassword}
              animDelay={FIELD_BASE + 300}
              right={
                <Pressable
                  onPress={() => setShowConfirm(v => !v)}
                  style={s.eyeBtn}
                  hitSlop={8}
                  accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.auth.muted} />
                </Pressable>
              }
            />

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
                      <Text style={s.ctaText}>Create Account</Text>
                      <View style={s.ctaArrow}>
                        <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                      </View>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>

            <Animated.View style={[s.orDivider, { opacity: socialOpacity, transform: [{ translateY: socialTransY }] }]}>
              <View style={s.dividerLine} />
              <View style={s.dividerPill}>
                <Text style={s.dividerText}>or sign up with</Text>
              </View>
              <View style={s.dividerLine} />
            </Animated.View>

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
                    <View style={s.googleIcon}>
                      <Text style={s.googleG}>G</Text>
                    </View>
                    <Text style={s.googleBtnText}>Google</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [s.socialBtn, s.fbBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                accessibilityLabel="Sign up with Facebook"
              >
                <Ionicons name="logo-facebook" size={20} color={colors.white} />
                <Text style={s.fbBtnText}>Facebook</Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[s.footer, { opacity: footerOpacity }]}>
              <Text style={s.footerText}>Already have an account?</Text>
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={s.footerLink}> Log In</Text>
              </Pressable>
            </Animated.View>

          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.auth.pageBg },
  flex: { flex: 1 },

  hero: {
    height: HERO_H,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute', borderRadius: 999,
    backgroundColor: colors.overlay.whiteThin,
  },
  orb1: { width: 180, height: 180, top: -50, right: -40 },
  orb2: { width: 120, height: 120, bottom: 0, left: -30, backgroundColor: colors.overlay.whiteSubtle },

  backBtn: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: colors.overlay.whiteSoft,
    borderWidth: 1, borderColor: colors.overlay.whiteAccent,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  heroContent: {
    alignItems: 'center', gap: 8,
  },
  heroBadge: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: colors.overlay.whiteRegular,
    borderWidth: 1.5, borderColor: colors.overlay.whiteFirm,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: 0.5,
  },
  heroSub: {
    fontSize: 13, color: colors.overlay.whiteMid, letterSpacing: 0.3,
  },

  waveWrap: {
    height: 50, position: 'relative', marginTop: -1,
  },
  waveShape: {
    position: 'absolute', bottom: 0,
    left: -12, right: -12, height: 55,
    backgroundColor: colors.auth.pageBg,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
  },

  formArea: {
    flex: 1, backgroundColor: colors.auth.pageBg, marginTop: -2,
  },
  formScroll: {
    paddingHorizontal: 24, paddingTop: 0,
  },

  titleRow: {
    flexDirection: 'row', alignItems: 'baseline',
    marginBottom: 4,
  },
  titleBold: { fontSize: 28, fontWeight: '800', color: colors.auth.heading },
  titleLight: { fontSize: 28, fontWeight: '300', color: colors.auth.heading },
  titleSub: { fontSize: 14, color: colors.auth.muted, marginBottom: 20 },

  nameRow: { flexDirection: 'row', gap: 10 },
  nameHalf: { flex: 1 },

  divider: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginVertical: 6, marginBottom: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.auth.inputIconBg },
  dividerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: colors.auth.inputBg, borderRadius: 20,
  },
  dividerText: { fontSize: 11, fontWeight: '600', color: colors.auth.muted },

  strengthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: -8, marginBottom: 14, paddingHorizontal: 4,
  },
  strengthTrack: {
    flexDirection: 'row', gap: 4, flex: 1,
  },
  strengthBar: {
    flex: 1, height: 4, borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11, fontWeight: '700',
  },

  eyeBtn: { paddingHorizontal: 10 },

  ctaBtn: {
    height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 4,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  ctaText: {
    fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 0.5,
  },
  ctaArrow: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: colors.overlay.whiteAccent,
    alignItems: 'center', justifyContent: 'center',
  },

  orDivider: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginVertical: 18,
  },

  socialRow: {
    flexDirection: 'row', gap: 12, marginBottom: 20,
  },
  socialBtn: {
    flex: 1, height: 50, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
  },
  googleBtn: {
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.auth.inputIconBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  googleIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.auth.inputBg,
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: 15, fontWeight: '800', color: colors.social.google },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: colors.auth.bodyText },
  fbBtn: {
    backgroundColor: colors.social.facebook,
    shadowColor: colors.social.facebook,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  fbBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  footerText: { fontSize: 14, color: colors.auth.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: colors.auth.primary },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: 4,
  },
  securityText: { fontSize: 11, color: colors.auth.placeholder, fontWeight: '500' },
});
