/**
 * Login screen — premium sleek design
 *
 * Tall gradient hero with glassmorphic logo badge · organic wave transition
 * Frosted inputs with glow focus · gradient CTA · Google button with icon
 * Staggered entrance animations · shimmer effects · floating particles
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
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = SCREEN_H * 0.42;

// ─── Floating particle ─────────────────────────────────────────────────────

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
    <Animated.View
      style={{
        position: 'absolute', left: x, top: y,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.5)',
        opacity, transform: [{ translateY }],
      }}
    />
  );
}

// ─── Pulse ring ─────────────────────────────────────────────────────────────

function PulseRing({ size, color, delay }: { size: number; color: string; delay: number }) {
  const scale   = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 2800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 2800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 0.6, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.35, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity, delay]);

  return (
    <Animated.View style={{
      position: 'absolute',
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 1.5, borderColor: color,
      opacity, transform: [{ scale }],
    }} />
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { login } = useAuth();

  // ── Splash ──
  const [showSplash, setShowSplash] = useState(true);
  const splashLogoScale   = useRef(new Animated.Value(0.3)).current;
  const splashLogoOpacity = useRef(new Animated.Value(0)).current;
  const splashTextOpacity = useRef(new Animated.Value(0)).current;
  const splashTextTransY  = useRef(new Animated.Value(20)).current;
  const splashSubOpacity  = useRef(new Animated.Value(0)).current;
  const splashBgOpacity   = useRef(new Animated.Value(1)).current;
  const splashShimmer     = useRef(new Animated.Value(0)).current;

  // ── Form entrance ──
  const heroScale     = useRef(new Animated.Value(1.05)).current;
  const heroOpacity   = useRef(new Animated.Value(0)).current;
  const formOpacity   = useRef(new Animated.Value(0)).current;
  const formTransY    = useRef(new Animated.Value(60)).current;
  const f1Opacity     = useRef(new Animated.Value(0)).current;
  const f1TransX      = useRef(new Animated.Value(-30)).current;
  const f2Opacity     = useRef(new Animated.Value(0)).current;
  const f2TransX      = useRef(new Animated.Value(-30)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const btnScale      = useRef(new Animated.Value(0.85)).current;
  const gBtnOpacity   = useRef(new Animated.Value(0)).current;
  const gBtnTransY    = useRef(new Animated.Value(15)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  // ── Form state ──
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');
  const [emailFocus, setEmailFocus]     = useState(false);
  const [pwdFocus, setPwdFocus]         = useState(false);

  // Focus glows (non-native driver for border color interpolation)
  const emailGlow = useRef(new Animated.Value(0)).current;
  const pwdGlow   = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(emailGlow, { toValue: emailFocus ? 1 : 0, duration: 250, useNativeDriver: false }).start(); }, [emailFocus]);
  useEffect(() => { Animated.timing(pwdGlow,   { toValue: pwdFocus   ? 1 : 0, duration: 250, useNativeDriver: false }).start(); }, [pwdFocus]);

  // ── Splash → form ──
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(splashLogoScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(splashLogoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(splashShimmer, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(splashTextOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(splashTextTransY,  { toValue: 0, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.timing(splashSubOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(splashBgOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start(() => {
      setShowSplash(false);
      Animated.stagger(90, [
        Animated.parallel([
          Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(heroScale,   { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(formOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(f1Opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.spring(f1TransX,  { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(f2Opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.spring(f2TransX,  { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(btnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.spring(btnScale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(gBtnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.spring(gBtnTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        ]),
        Animated.timing(footerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    });
  }, []);

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

  const handleGoogleLogin = useCallback(async () => {
    setErrorMsg('');
    setIsGoogleLoading(true);
    try {
      // TODO: Integrate with Google OAuth
      await new Promise(r => setTimeout(r, 1500));
      setErrorMsg('Google sign-in is not yet configured.');
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  const emailValid = email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const shimmerX = splashShimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 220] });
  const emailBorder = emailGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', '#5A6FF5'] });
  const pwdBorder   = pwdGlow.interpolate({   inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', '#5A6FF5'] });

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ═══════ SPLASH ═══════ */}
      {showSplash && (
        <Animated.View style={[s.splashOverlay, { opacity: splashBgOpacity }]}>
          <LinearGradient
            colors={['#00D2FF', '#4A6CF7', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Pulse rings */}
          <View style={s.pulseCenter}>
            <PulseRing size={180} color="rgba(255,255,255,0.12)" delay={0} />
            <PulseRing size={260} color="rgba(255,255,255,0.08)" delay={800} />
            <PulseRing size={340} color="rgba(255,255,255,0.04)" delay={1600} />
          </View>

          <Particle delay={100}  x={SCREEN_W * 0.12} y={SCREEN_H * 0.3} />
          <Particle delay={500}  x={SCREEN_W * 0.8}  y={SCREEN_H * 0.35} size={3} />
          <Particle delay={900}  x={SCREEN_W * 0.25} y={SCREEN_H * 0.58} size={5} />
          <Particle delay={1300} x={SCREEN_W * 0.7}  y={SCREEN_H * 0.28} />
          <Particle delay={700}  x={SCREEN_W * 0.5}  y={SCREEN_H * 0.62} size={3} />

          <Animated.View style={[s.splashLogoWrap, {
            opacity: splashLogoOpacity,
            transform: [{ scale: splashLogoScale }],
          }]}>
            <View style={s.splashLogoBadge}>
              <Ionicons name="water" size={50} color="#fff" />
              <Animated.View style={[s.shimmerBar, { transform: [{ translateX: shimmerX }] }]} />
            </View>
          </Animated.View>
          <Animated.Text style={[s.splashTitle, {
            opacity: splashTextOpacity,
            transform: [{ translateY: splashTextTransY }],
          }]}>
            FLOODTRACK
          </Animated.Text>
          <Animated.Text style={[s.splashSub, { opacity: splashSubOpacity }]}>
            Real-time flood monitoring & alerts
          </Animated.Text>
          <Animated.View style={[s.splashVersionPill, { opacity: splashSubOpacity }]}>
            <Text style={s.splashVersionText}>v1.0.0</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* ═══════ MAIN ═══════ */}
      {!showSplash && (
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Gradient hero ── */}
          <Animated.View style={[s.heroWrap, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}>
            <LinearGradient
              colors={['#00D2FF', '#4A6CF7', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.hero, { paddingTop: insets.top + 12 }]}
            >
              {/* Decorative orbs */}
              <View style={[s.orb, s.orb1]} />
              <View style={[s.orb, s.orb2]} />
              <View style={[s.orb, s.orb3]} />

              {/* Floating particles */}
              <Particle delay={200}  x={SCREEN_W * 0.1}  y={40} size={3} />
              <Particle delay={800}  x={SCREEN_W * 0.85} y={60} size={4} />
              <Particle delay={1200} x={SCREEN_W * 0.4}  y={30} size={3} />

              {/* Logo badge */}
              <View style={s.logoBadge}>
                <View style={s.logoBadgeInner}>
                  <Ionicons name="water" size={44} color="#fff" />
                </View>
                <View style={s.logoBadgeRing} />
              </View>

              <Text style={s.logoTitle}>FLOODTRACK</Text>
              <Text style={s.logoSub}>Stay informed, stay safe</Text>
            </LinearGradient>

            {/* Wave transition */}
            <View style={s.waveWrap}>
              <LinearGradient
                colors={['#6B52F5', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={s.waveShape} />
            </View>
          </Animated.View>

          {/* ── Form area ── */}
          <Animated.View style={[s.formArea, { opacity: formOpacity, transform: [{ translateY: formTransY }] }]}>
            <ScrollView
              contentContainerStyle={[s.formScroll, { paddingBottom: insets.bottom + 36 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Title */}
              <View style={s.titleRow}>
                <Text style={s.titleBold}>Welcome </Text>
                <Text style={s.titleLight}>back !</Text>
              </View>
              <Text style={s.titleSub}>Sign in to access your dashboard</Text>

              {/* Error */}
              {errorMsg ? (
                <View style={s.errorBanner}>
                  <View style={s.errorDot} />
                  <Ionicons name="alert-circle" size={15} color="#E53E3E" />
                  <Text style={s.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Email */}
              <Animated.View style={[s.fieldWrap, { opacity: f1Opacity, transform: [{ translateX: f1TransX }] }]}>
                <Animated.View style={[s.inputRow, { borderColor: emailBorder }, emailFocus && s.inputFocused]}>
                  <View style={[s.inputIconWrap, emailFocus && s.inputIconActive]}>
                    <Ionicons name="mail-outline" size={18} color={emailFocus ? '#5A6FF5' : '#A0AEC0'} />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Email address"
                    placeholderTextColor="#CBD5E0"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={t => { setEmail(t); setErrorMsg(''); }}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                  />
                  {emailValid && (
                    <View style={s.checkBadge}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                </Animated.View>
              </Animated.View>

              {/* Password */}
              <Animated.View style={[s.fieldWrap, { opacity: f2Opacity, transform: [{ translateX: f2TransX }] }]}>
                <Animated.View style={[s.inputRow, { borderColor: pwdBorder }, pwdFocus && s.inputFocused]}>
                  <View style={[s.inputIconWrap, pwdFocus && s.inputIconActive]}>
                    <Ionicons name="lock-closed-outline" size={18} color={pwdFocus ? '#5A6FF5' : '#A0AEC0'} />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Password"
                    placeholderTextColor="#CBD5E0"
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
                    <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A0AEC0" />
                  </Pressable>
                </Animated.View>
              </Animated.View>

              {/* Options */}
              <View style={s.optionsRow}>
                <Pressable
                  style={s.rememberRow}
                  onPress={() => setRemember(v => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: remember }}
                >
                  <View style={[s.checkbox, remember && s.checkboxOn]}>
                    {remember && <Ionicons name="checkmark" size={11} color="#fff" />}
                  </View>
                  <Text style={s.rememberLabel}>Remember me</Text>
                </Pressable>
                <Pressable hitSlop={6}>
                  <Text style={s.forgotLink}>Forgot password?</Text>
                </Pressable>
              </View>

              {/* Login CTA */}
              <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnScale }] }}>
                <Pressable
                  onPress={handleLogin}
                  disabled={isLoading || isGoogleLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Login"
                  style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                >
                  <LinearGradient
                    colors={isLoading ? ['#8B9CF7', '#A78BFA'] : ['#4A6CF7', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.loginBtn}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={s.loginBtnText}>Sign In</Text>
                        <View style={s.loginBtnArrow}>
                          <Ionicons name="arrow-forward" size={16} color="#4A6CF7" />
                        </View>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              {/* Divider */}
              <Animated.View style={[s.dividerRow, { opacity: gBtnOpacity, transform: [{ translateY: gBtnTransY }] }]}>
                <View style={s.dividerLine} />
                <View style={s.dividerPill}>
                  <Text style={s.dividerText}>or continue with</Text>
                </View>
                <View style={s.dividerLine} />
              </Animated.View>

              {/* Social row */}
              <Animated.View style={[s.socialRow, { opacity: gBtnOpacity, transform: [{ translateY: gBtnTransY }] }]}>
                {/* Google */}
                <Pressable
                  style={({ pressed }) => [s.socialBtn, s.googleBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                  onPress={handleGoogleLogin}
                  disabled={isLoading || isGoogleLoading}
                  accessibilityLabel="Sign in with Google"
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator size="small" color="#4285F4" />
                  ) : (
                    <>
                      <View style={s.googleIconCircle}>
                        <Text style={s.googleG}>G</Text>
                      </View>
                      <Text style={s.googleBtnText}>Google</Text>
                    </>
                  )}
                </Pressable>

                {/* Facebook */}
                <Pressable
                  style={({ pressed }) => [s.socialBtn, s.fbBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                  accessibilityLabel="Sign in with Facebook"
                >
                  <Ionicons name="logo-facebook" size={20} color="#fff" />
                  <Text style={s.fbBtnText}>Facebook</Text>
                </Pressable>
              </Animated.View>

              {/* Footer */}
              <Animated.View style={[s.footer, { opacity: footerOpacity }]}>
                <Text style={s.footerText}>Don't have an account?</Text>
                <Pressable onPress={() => router.push('/signup')} hitSlop={8}>
                  <Text style={s.footerLink}> Sign Up</Text>
                </Pressable>
              </Animated.View>

            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFBFE' },
  flex: { flex: 1 },

  // ── Splash ──────────────────────────
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  pulseCenter: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
    width: 340, height: 340,
  },
  splashLogoWrap: { marginBottom: 18, alignItems: 'center' },
  splashLogoBadge: {
    width: 110, height: 110, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  shimmerBar: {
    position: 'absolute', top: 0, bottom: 0,
    width: 70,
    backgroundColor: 'rgba(255,255,255,0.22)',
    transform: [{ skewX: '-20deg' }],
  },
  splashTitle: {
    fontSize: 30, fontWeight: '900', color: '#fff',
    letterSpacing: 5, textAlign: 'center',
  },
  splashSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)',
    textAlign: 'center', marginTop: 8,
  },
  splashVersionPill: {
    position: 'absolute', bottom: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20,
  },
  splashVersionText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },

  // ── Hero ────────────────────────────
  heroWrap: {},
  hero: {
    height: HERO_H,
    alignItems: 'center', justifyContent: 'center',
    paddingBottom: 36,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute', borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orb1: { width: 200, height: 200, top: -60, right: -50 },
  orb2: { width: 140, height: 140, bottom: 10, left: -40, backgroundColor: 'rgba(255,255,255,0.04)' },
  orb3: { width: 80,  height: 80,  top: 40,   left: SCREEN_W * 0.55, backgroundColor: 'rgba(255,255,255,0.05)' },

  logoBadge: {
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  logoBadgeInner: {
    width: 80, height: 80, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  logoTitle: {
    fontSize: 24, fontWeight: '900', color: '#fff',
    letterSpacing: 5,
  },
  logoSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)',
    marginTop: 6, letterSpacing: 1,
  },

  // ── Wave ────────────────────────────
  waveWrap: {
    height: 55, position: 'relative', marginTop: -1,
  },
  waveShape: {
    position: 'absolute', bottom: 0,
    left: -12, right: -12,
    height: 60,
    backgroundColor: '#FAFBFE',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },

  // ── Form ────────────────────────────
  formArea: {
    flex: 1, backgroundColor: '#FAFBFE', marginTop: -2,
  },
  formScroll: {
    paddingHorizontal: 28, paddingTop: 2,
  },

  titleRow: {
    flexDirection: 'row', alignItems: 'baseline',
    marginBottom: 4,
  },
  titleBold: { fontSize: 30, fontWeight: '800', color: '#1A202C' },
  titleLight: { fontSize: 30, fontWeight: '300', color: '#1A202C' },
  titleSub: { fontSize: 14, color: '#A0AEC0', marginBottom: 24 },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF5F5',
    borderWidth: 1, borderColor: '#FED7D7',
    borderRadius: 14, padding: 14, marginBottom: 18,
  },
  errorDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: '#E53E3E',
  },
  errorText: { flex: 1, fontSize: 13, color: '#E53E3E', fontWeight: '500' },

  // Fields
  fieldWrap: { marginBottom: 14 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 16,
    backgroundColor: '#F7F8FC',
    borderWidth: 1.5, borderColor: 'transparent',
    paddingHorizontal: 4,
  },
  inputFocused: {
    backgroundColor: '#fff',
    shadowColor: '#5A6FF5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  inputIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EDF0F7',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  inputIconActive: {
    backgroundColor: '#EBF0FF',
  },
  input: {
    flex: 1, fontSize: 15, color: '#1A202C',
    paddingHorizontal: 12, height: '100%',
  },
  checkBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#48BB78',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  eyeBtn: { paddingHorizontal: 12 },

  // Options
  optionsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22, marginTop: 2,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#CBD5E0',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: '#5A6FF5', borderColor: '#5A6FF5',
  },
  rememberLabel: { fontSize: 13, color: '#718096', fontWeight: '500' },
  forgotLink: { fontSize: 13, color: '#5A6FF5', fontWeight: '700' },

  // Login CTA
  loginBtn: {
    height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
    shadowColor: '#5A6FF5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  loginBtnText: {
    fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.5,
  },
  loginBtnArrow: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 20, gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#EDF0F7' },
  dividerPill: {
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: '#F7F8FC', borderRadius: 20,
  },
  dividerText: { fontSize: 12, fontWeight: '600', color: '#A0AEC0' },

  // Social
  socialRow: {
    flexDirection: 'row', gap: 12,
    marginBottom: 22,
  },
  socialBtn: {
    flex: 1, height: 52, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
  },
  googleBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#EDF0F7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  googleIconCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F7F8FC',
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: 16, fontWeight: '800', color: '#4285F4' },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: '#2D3748' },
  fbBtn: {
    backgroundColor: '#1877F2',
    shadowColor: '#1877F2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  fbBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  footerText: { fontSize: 14, color: '#A0AEC0' },
  footerLink: { fontSize: 14, fontWeight: '800', color: '#5A6FF5' },

  // Security
  securityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: 4,
  },
  securityText: { fontSize: 11, color: '#CBD5E0', fontWeight: '500' },
});
