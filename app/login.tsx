import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppAlert, AlertConfig } from '@/components/AppAlert';
import { colors } from '@/theme/colors';

let GoogleSignin: any = null;
let statusCodes: any = {};
try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;
  statusCodes = mod.statusCodes;
  GoogleSignin.configure({
    webClientId: '27555047365-djh6rc1h40nob87nu20ghtc5irp4eagb.apps.googleusercontent.com',
    offlineAccess: true,
  });
} catch {
  // Native module not available — requires a dev build (npx expo run:android)
}


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
        backgroundColor: colors.overlay.whiteHalf,
        opacity, transform: [{ translateY }],
      }}
    />
  );
}

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

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { login } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // ── Responsive breakpoints & scale ──
  const isTiny  = screenH < 620;   // very small phones (SE 1st gen, etc.)
  const isSmall = screenH < 700;   // small phones
  const isMid   = screenH < 820;   // average phones
  // >= 820 = tall phones / tablets

  // Scale factor: 1.0 at 812 (iPhone X baseline), scales proportionally
  const vScale = Math.min(screenH / 812, 1.15);
  const hScale = Math.min(screenW / 375, 1.15);

  const heroH = isTiny ? screenH * 0.28 : isSmall ? screenH * 0.30 : Math.min(screenH * 0.34, 320);

  // Responsive sizes
  const r = {
    // Hero
    logoSize:      isTiny ? 44 : isSmall ? 52 : Math.round(64 * hScale),
    logoBadge:     isTiny ? 64 : isSmall ? 76 : Math.round(100 * hScale),
    logoBadgeR:    isTiny ? 19 : isSmall ? 23 : Math.round(100 * hScale * 0.3),
    logoRing:      isTiny ? 86 : isSmall ? 98 : Math.round(122 * hScale),
    logoRingOuter: isTiny ? 106 : isSmall ? 120 : Math.round(148 * hScale),
    heroTitle:     isTiny ? 16 : isSmall ? 18 : Math.round(24 * hScale),
    heroTitleLS:   isTiny ? 3 : isSmall ? 4 : 5,
    heroSub:       isTiny ? 10 : isSmall ? 11 : 12,
    orbScale:      isTiny ? 0.5 : isSmall ? 0.7 : 1,

    // Form
    formPadX:  Math.round(Math.max(20, 28 * hScale)),
    heading:   isTiny ? 22 : isSmall ? 24 : Math.round(30 * vScale),
    subText:   isTiny ? 12 : 13,
    inputH:    isTiny ? 46 : isSmall ? 50 : Math.round(56 * vScale),
    inputR:    isTiny ? 12 : isSmall ? 14 : 16,
    inputFont: isTiny ? 13 : isSmall ? 14 : 15,
    iconWrap:  isTiny ? 32 : isSmall ? 36 : 40,
    iconR:     isTiny ? 9 : isSmall ? 10 : 12,
    iconSize:  isTiny ? 15 : isSmall ? 16 : 18,
    btnH:      isTiny ? 46 : isSmall ? 50 : Math.round(56 * vScale),
    btnR:      isTiny ? 12 : isSmall ? 14 : 16,
    btnFont:   isTiny ? 14 : isSmall ? 15 : 16,
    googleH:   isTiny ? 44 : isSmall ? 48 : 52,
    googleR:   isTiny ? 11 : isSmall ? 12 : 14,
    fieldGap:  isTiny ? 8 : isSmall ? 10 : 12,
    optionsMB: isTiny ? 14 : isSmall ? 18 : 24,
    checkSize: isTiny ? 17 : isSmall ? 18 : 20,
    checkR:    isTiny ? 5 : isSmall ? 5 : 6,
    dividerMV: isTiny ? 10 : isSmall ? 12 : 16,
    footerMT:  isTiny ? 10 : isSmall ? 14 : 20,
    labelFont: isTiny ? 12 : 13,

    // Splash
    splashLogo:  isTiny ? 100 : isSmall ? 120 : 140,
    splashLogoR: isTiny ? 28 : isSmall ? 32 : 38,
    splashImg:   isTiny ? 56 : isSmall ? 68 : 80,
    splashTitle: isTiny ? 22 : isSmall ? 26 : 30,
    splashSub:   isTiny ? 11 : isSmall ? 12 : 13,
  };


  const SPLASH_LETTERS = 'FLOODTRACK'.split('');
  const [showSplash, setShowSplash] = useState(true);
  const splashLogoScale   = useRef(new Animated.Value(0.3)).current;
  const splashLogoOpacity = useRef(new Animated.Value(0)).current;
  const splashTextOpacity = useRef(new Animated.Value(0)).current;
  const splashTextTransY  = useRef(new Animated.Value(20)).current;
  const splashSubOpacity  = useRef(new Animated.Value(0)).current;
  const splashBgOpacity   = useRef(new Animated.Value(1)).current;
  const splashShimmer     = useRef(new Animated.Value(0)).current;
  const letterAnims       = useRef(SPLASH_LETTERS.map(() => ({
    opacity:    new Animated.Value(0),
    translateY: new Animated.Value(18),
    scale:      new Animated.Value(0.5),
  }))).current;

  /* Hero continuous animations */
  const heroPulse      = useRef(new Animated.Value(0)).current;
  const heroFloat      = useRef(new Animated.Value(0)).current;
  const heroTitleShimmer = useRef(new Animated.Value(0)).current;

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

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [alertConfig, setAlertConfig]   = useState<AlertConfig | null>(null);
  const [emailFocus, setEmailFocus]     = useState(false);
  const [pwdFocus, setPwdFocus]         = useState(false);
  const [emailError, setEmailError]     = useState('');
  const [pwdError, setPwdError]         = useState(false);

  const emailGlow = useRef(new Animated.Value(0)).current;
  const pwdGlow   = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(emailGlow, { toValue: emailFocus ? 1 : 0, duration: 250, useNativeDriver: false }).start(); }, [emailFocus]);
  useEffect(() => { Animated.timing(pwdGlow,   { toValue: pwdFocus   ? 1 : 0, duration: 250, useNativeDriver: false }).start(); }, [pwdFocus]);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(splashLogoScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(splashLogoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(splashShimmer, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.stagger(50, letterAnims.map(la =>
        Animated.parallel([
          Animated.timing(la.opacity,    { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.spring(la.translateY, { toValue: 0, friction: 6, tension: 100, useNativeDriver: true }),
          Animated.spring(la.scale,      { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        ]),
      )),
      Animated.timing(splashSubOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(splashBgOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start(() => {
      setShowSplash(false);

      // Continuous hero animations
      Animated.loop(
        Animated.sequence([
          Animated.timing(heroPulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(heroPulse, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(heroFloat, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(heroFloat, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(heroTitleShimmer, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.delay(2000),
          Animated.timing(heroTitleShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ).start();

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
    const trimmed = email.trim();
    let hasError = false;

    // Email validation
    if (!trimmed) {
      setEmailError('Email is required');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Enter a valid email address');
      hasError = true;
    } else {
      setEmailError('');
    }

    // Password validation (red border only)
    if (!password.trim()) {
      setPwdError(true);
      hasError = true;
    } else {
      setPwdError(false);
    }

    if (hasError) return;

    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch (e: any) {
      setAlertConfig({
        type: 'error',
        title: 'Incorrect Password',
        message: e?.message ?? 'Invalid credentials. Please check your email and password and try again.',
        confirmText: 'Try Again',
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, password, login]);

  const handleGoogleLogin = useCallback(async () => {
    if (!GoogleSignin) {
      setAlertConfig({ type: 'info', title: 'Not Available', message: 'Google Sign-In requires a native build. Run: npx expo run:android', confirmText: 'OK' });
      return;
    }
    setIsGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.data?.idToken) {
        await login({ googleIdToken: response.data.idToken });
      } else {
        throw new Error('No ID token returned from Google.');
      }
    } catch (e: any) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e.code === statusCodes.IN_PROGRESS) return;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setAlertConfig({ type: 'error', title: 'Not Available', message: 'Google Play Services is not available on this device.', confirmText: 'OK' });
        return;
      }
      setAlertConfig({ type: 'error', title: 'Google Sign-In Failed', message: e?.message ?? 'Could not sign in with Google.', confirmText: 'OK' });
    } finally {
      setIsGoogleLoading(false);
    }
  }, [login]);

  const emailValid = email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const shimmerX = splashShimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 220] });
  const heroPulseScale = heroPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const heroPulseOpacity = heroPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const heroFloatY = heroFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const heroShimmerX = heroTitleShimmer.interpolate({ inputRange: [0, 1], outputRange: [-screenW, screenW] });
  const emailBorder = emailGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', colors.auth.primary] });
  const pwdBorder   = pwdGlow.interpolate({   inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', colors.auth.primary] });

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {showSplash && (
        <Animated.View style={[s.splashOverlay, { opacity: splashBgOpacity }]}>
          <LinearGradient
            colors={colors.gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={s.pulseCenter}>
            <PulseRing size={180} color={colors.overlay.whiteMedium} delay={0} />
            <PulseRing size={260} color={colors.overlay.whiteDim} delay={800} />
            <PulseRing size={340} color={colors.overlay.whiteSubtle} delay={1600} />
          </View>

          <Particle delay={100}  x={screenW * 0.12} y={screenH * 0.3} />
          <Particle delay={500}  x={screenW * 0.8}  y={screenH * 0.35} size={3} />
          <Particle delay={900}  x={screenW * 0.25} y={screenH * 0.58} size={5} />
          <Particle delay={1300} x={screenW * 0.7}  y={screenH * 0.28} />
          <Particle delay={700}  x={screenW * 0.5}  y={screenH * 0.62} size={3} />

          <Animated.View style={[s.splashLogoWrap, {
            opacity: splashLogoOpacity,
            transform: [{ scale: splashLogoScale }],
          }]}>
            <View style={[s.splashLogoBadge, { width: r.splashLogo, height: r.splashLogo, borderRadius: r.splashLogoR }]}>
              <Image source={require('@/assets/images/floodtrack-badge-primary.png')} style={{ width: r.splashImg, height: r.splashImg }} resizeMode="contain" />
              <Animated.View style={[s.shimmerBar, { transform: [{ translateX: shimmerX }] }]} />
            </View>
          </Animated.View>
          <View style={s.splashTitleRow}>
            {SPLASH_LETTERS.map((letter, i) => (
              <Animated.Text
                key={i}
                style={[s.splashTitleLetter, {
                  fontSize: r.splashTitle,
                  opacity: letterAnims[i].opacity,
                  transform: [
                    { translateY: letterAnims[i].translateY },
                    { scale: letterAnims[i].scale },
                  ],
                }]}
              >
                {letter}
              </Animated.Text>
            ))}
          </View>
          <Animated.Text style={[s.splashSub, { fontSize: r.splashSub, opacity: splashSubOpacity }]}>
            Real-time flood monitoring & alerts
          </Animated.Text>
          <Animated.View style={[s.splashVersionPill, { opacity: splashSubOpacity }]}>
            <Text style={s.splashVersionText}>v1.0.0</Text>
          </Animated.View>
        </Animated.View>
      )}

      {!showSplash && (
      <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View style={[s.heroWrap, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}>
            <LinearGradient
              colors={colors.gradients.hero}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.hero, { height: heroH, paddingTop: insets.top + (isTiny ? 4 : 12), paddingBottom: isTiny ? 16 : isSmall ? 24 : 36 }]}
            >
              <View style={[s.orb, { width: 200 * r.orbScale, height: 200 * r.orbScale, top: -60 * r.orbScale, right: -50 }]} />
              <View style={[s.orb, { width: 140 * r.orbScale, height: 140 * r.orbScale, bottom: 10, left: -40, backgroundColor: colors.overlay.whiteSubtle }]} />
              <View style={[s.orb, { width: 80 * r.orbScale, height: 80 * r.orbScale, top: 40, left: screenW * 0.55, backgroundColor: colors.overlay.whiteFaint }]} />

              <Particle delay={200}  x={screenW * 0.1}  y={40} size={3} />
              <Particle delay={800}  x={screenW * 0.85} y={60} size={4} />
              <Particle delay={1200} x={screenW * 0.4}  y={30} size={3} />

              <Animated.View style={{ transform: [{ translateY: heroFloatY }] }}>
                <View style={[s.logoBadgeBase, { marginBottom: isTiny ? 6 : isSmall ? 8 : 16 }]}>
                  <View style={[s.logoBadgeInnerBase, { width: r.logoBadge, height: r.logoBadge, borderRadius: r.logoBadgeR }]}>
                    <Image source={require('@/assets/images/floodtrack-badge-primary.png')} style={{ width: r.logoSize, height: r.logoSize }} resizeMode="contain" />
                  </View>
                  {!isTiny && (
                    <Animated.View style={[s.logoBadgeRingBase, {
                      width: r.logoRing, height: r.logoRing, borderRadius: r.logoRing / 2,
                      opacity: heroPulseOpacity,
                      transform: [{ scale: heroPulseScale }],
                    }]} />
                  )}
                  {!isTiny && !isSmall && (
                    <Animated.View style={[s.logoBadgeRingBase, {
                      width: r.logoRingOuter, height: r.logoRingOuter, borderRadius: r.logoRingOuter / 2,
                      borderColor: colors.overlay.whiteLight,
                      opacity: heroPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.25, 0] }),
                      transform: [{ scale: heroPulse.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1.35] }) }],
                    }]} />
                  )}
                </View>
              </Animated.View>

              <View style={s.heroTitleWrap}>
                <Text style={[s.logoTitleBase, { fontSize: r.heroTitle, letterSpacing: r.heroTitleLS }]}>FLOODTRACK</Text>
                <Animated.View style={[s.heroTitleShimmer, { transform: [{ translateX: heroShimmerX }] }]} />
              </View>
              <Text style={[s.logoSubBase, { fontSize: r.heroSub }]}>Stay informed, stay safe</Text>
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
              contentContainerStyle={[s.formScroll, { paddingHorizontal: r.formPadX, paddingBottom: insets.bottom + (isTiny ? 16 : 36) }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={s.titleRow}>
                <Text style={[s.titleBold, { fontSize: r.heading }]}>Welcome </Text>
                <Text style={[s.titleLight, { fontSize: r.heading }]}>back !</Text>
              </View>
              <Text style={[s.titleSub, { fontSize: r.subText, marginBottom: isTiny ? 8 : isSmall ? 10 : 14 }]}>Sign in to access your dashboard</Text>


              <Animated.View style={[{ marginBottom: r.fieldGap }, { opacity: f1Opacity, transform: [{ translateX: f1TransX }] }]}>
                <Animated.View style={[
                  s.inputRow,
                  { height: r.inputH, borderRadius: r.inputR, borderColor: emailError ? colors.feedback.error : emailBorder },
                  emailFocus && !emailError && s.inputFocused,
                  emailError ? s.inputError : null,
                ]}>
                  <View style={[s.inputIconWrap, { width: r.iconWrap, height: r.iconWrap, borderRadius: r.iconR }, emailFocus && !emailError && s.inputIconActive, emailError ? s.inputIconError : null]}>
                    <Ionicons name="mail-outline" size={r.iconSize} color={emailError ? colors.feedback.error : emailFocus ? colors.auth.primary : colors.auth.muted} />
                  </View>
                  <TextInput
                    style={[s.input, { fontSize: r.inputFont }]}
                    placeholder="Email address"
                    placeholderTextColor={colors.auth.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={t => { setEmail(t); if (emailError) setEmailError(''); }}
                    onFocus={() => setEmailFocus(true)}
                    onBlur={() => setEmailFocus(false)}
                  />
                  {emailValid && !emailError && (
                    <View style={s.checkBadge}>
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    </View>
                  )}
                </Animated.View>
                {emailError ? (
                  <Text style={s.fieldError}>{emailError}</Text>
                ) : null}
              </Animated.View>

              <Animated.View style={[{ marginBottom: r.fieldGap }, { opacity: f2Opacity, transform: [{ translateX: f2TransX }] }]}>
                <Animated.View style={[
                  s.inputRow,
                  { height: r.inputH, borderRadius: r.inputR, borderColor: pwdError ? colors.feedback.error : pwdBorder },
                  pwdFocus && !pwdError && s.inputFocused,
                  pwdError ? s.inputError : null,
                ]}>
                  <View style={[s.inputIconWrap, { width: r.iconWrap, height: r.iconWrap, borderRadius: r.iconR }, pwdFocus && !pwdError && s.inputIconActive, pwdError ? s.inputIconError : null]}>
                    <Ionicons name="lock-closed-outline" size={r.iconSize} color={pwdError ? colors.feedback.error : pwdFocus ? colors.auth.primary : colors.auth.muted} />
                  </View>
                  <TextInput
                    style={[s.input, { fontSize: r.inputFont }]}
                    placeholder="Password"
                    placeholderTextColor={colors.auth.placeholder}
                    secureTextEntry={!showPwd}
                    textContentType="password"
                    value={password}
                    onChangeText={t => { setPassword(t); if (pwdError) setPwdError(false); }}
                    onFocus={() => setPwdFocus(true)}
                    onBlur={() => setPwdFocus(false)}
                  />
                  <Pressable
                    onPress={() => setShowPwd(v => !v)}
                    style={s.eyeBtn}
                    hitSlop={8}
                    accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.auth.muted} />
                  </Pressable>
                </Animated.View>
              </Animated.View>

              <View style={[s.optionsRow, { marginBottom: r.optionsMB }]}>
                <Pressable
                  style={s.rememberRow}
                  onPress={() => setRemember(v => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: remember }}
                >
                  <View style={[s.checkbox, { width: r.checkSize, height: r.checkSize, borderRadius: r.checkR }, remember && s.checkboxOn]}>
                    {remember && <Ionicons name="checkmark" size={isTiny ? 9 : 11} color={colors.white} />}
                  </View>
                  <Text style={[s.rememberLabel, { fontSize: r.labelFont }]}>Remember me</Text>
                </Pressable>
                <Pressable hitSlop={6} onPress={() => router.push('/forgot-password')}>
                  <Text style={[s.forgotLink, { fontSize: r.labelFont }]}>Forgot password?</Text>
                </Pressable>
              </View>

              <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnScale }] }}>
                <Pressable
                  onPress={handleLogin}
                  disabled={isLoading || isGoogleLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Login"
                  style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                >
                  <LinearGradient
                    colors={isLoading ? colors.gradients.ctaDisabled : colors.gradients.cta}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[s.loginBtn, { height: r.btnH, borderRadius: r.btnR }]}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Text style={[s.loginBtnText, { fontSize: r.btnFont }]}>Sign In</Text>
                        <View style={s.loginBtnArrow}>
                          <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                        </View>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              <View style={[s.dividerRow, { marginVertical: r.dividerMV }]}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              <Pressable
                onPress={handleGoogleLogin}
                disabled={isLoading || isGoogleLoading}
                style={[s.socialBtn, s.googleBtn, { height: r.googleH, borderRadius: r.googleR }]}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google"
              >
                {isGoogleLoading ? (
                  <ActivityIndicator size="small" color={colors.social.google} />
                ) : (
                  <>
                    <View style={s.googleIconCircle}>
                      <Text style={s.googleG}>G</Text>
                    </View>
                    <Text style={s.googleBtnText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>

              <Animated.View style={[s.footer, { marginTop: r.footerMT, opacity: footerOpacity }]}>
                <Text style={s.footerText}>Don't have an account?</Text>
                <Pressable onPress={() => router.push('/signup')} hitSlop={8}>
                  <Text style={s.footerLink}> Sign Up</Text>
                </Pressable>
              </Animated.View>

            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {alertConfig && (
        <AppAlert
          config={alertConfig}
          onDismiss={() => setAlertConfig(null)}
        />
      )}

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.auth.pageBg },
  flex: { flex: 1 },

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
    backgroundColor: colors.overlay.whiteSoft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.overlay.whiteBright,
    overflow: 'hidden',
  },
  shimmerBar: {
    position: 'absolute', top: 0, bottom: 0,
    width: 70,
    backgroundColor: colors.overlay.whiteGlow,
    transform: [{ skewX: '-20deg' }],
  },
  splashTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  splashTitleLetter: {
    fontWeight: '900', color: colors.white,
    letterSpacing: 5,
  },
  splashSub: {
    color: colors.overlay.whiteMid,
    textAlign: 'center', marginTop: 8,
  },
  splashVersionPill: {
    position: 'absolute', bottom: 60,
    backgroundColor: colors.overlay.whiteLight,
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20,
  },
  splashVersionText: { fontSize: 11, fontWeight: '600', color: colors.overlay.whiteHalf },

  heroWrap: {},
  hero: {
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute', borderRadius: 999,
    backgroundColor: colors.overlay.whiteThin,
  },

  logoBadgeBase: {
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeInnerBase: {
    backgroundColor: colors.overlay.whiteRegular,
    borderWidth: 1.5, borderColor: colors.overlay.whiteFirm,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeRingBase: {
    position: 'absolute',
    borderWidth: 1.5, borderColor: colors.overlay.whiteBright,
  },
  heroTitleWrap: {
    overflow: 'hidden',
    borderRadius: 4,
  },
  heroTitleShimmer: {
    position: 'absolute', top: 0, bottom: 0,
    width: 60,
    backgroundColor: colors.overlay.whiteGlow,
    transform: [{ skewX: '-20deg' }],
  },
  logoTitleBase: {
    fontWeight: '900', color: colors.white,
  },
  logoSubBase: {
    color: colors.overlay.whiteSub,
    marginTop: 4, letterSpacing: 1,
  },

  waveWrap: {
    height: 20, position: 'relative', marginTop: -1,
  },
  waveShape: {
    position: 'absolute', bottom: 0,
    left: -12, right: -12,
    height: 32,
    backgroundColor: colors.auth.pageBg,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },

  formArea: {
    flex: 1, backgroundColor: colors.auth.pageBg, marginTop: -2,
  },
  formScroll: {
    paddingTop: 4,
  },

  titleRow: {
    flexDirection: 'row', alignItems: 'baseline',
    marginBottom: 2,
  },
  titleBold: { fontWeight: '800', color: colors.auth.heading },
  titleLight: { fontWeight: '300', color: colors.auth.heading },
  titleSub: { color: colors.auth.muted },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.auth.inputBg,
    borderWidth: 1.5, borderColor: 'transparent',
    paddingHorizontal: 4,
  },
  inputFocused: {
    backgroundColor: colors.white,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  inputIconWrap: {
    backgroundColor: colors.auth.inputIconBg,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  inputIconActive: {
    backgroundColor: colors.auth.inputIconActive,
  },
  input: {
    flex: 1, color: colors.auth.heading,
    paddingHorizontal: 12, height: '100%',
  },
  checkBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.feedback.success,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  eyeBtn: { paddingHorizontal: 12 },

  optionsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    borderWidth: 1.5, borderColor: colors.auth.placeholder,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.auth.primary, borderColor: colors.auth.primary,
  },
  rememberLabel: { fontSize: 13, color: colors.auth.tertiary, fontWeight: '500' },
  forgotLink: { fontSize: 13, color: colors.auth.primary, fontWeight: '700' },

  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  loginBtnText: {
    fontWeight: '800', color: colors.white, letterSpacing: 0.5,
  },
  loginBtnArrow: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: colors.overlay.whiteBright,
    alignItems: 'center', justifyContent: 'center',
  },

  fieldHint: {
    fontSize: 11, fontWeight: '600', color: colors.feedback.error,
    marginTop: 4, marginLeft: 4,
  },
  fieldError: {
    fontSize: 12, fontWeight: '600', color: colors.feedback.error,
    marginTop: 6, marginLeft: 8,
  },
  inputError: {
    borderColor: colors.feedback.error,
    backgroundColor: colors.feedback.errorBg,
  },
  inputIconError: {
    backgroundColor: colors.feedback.errorBg,
  },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  dividerLine: {
    flex: 1, height: 1, backgroundColor: colors.auth.placeholder,
  },
  dividerText: {
    fontSize: 13, fontWeight: '600', color: colors.auth.muted,
  },
  socialBtn: {
    flex: 1,
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
  googleIconCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.auth.inputBg,
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontSize: 16, fontWeight: '800', color: colors.social.google },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: colors.auth.bodyText },
  googleBtnFull: { flex: 1 },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  footerText: { fontSize: 14, color: colors.auth.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: colors.auth.primary },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: 4,
  },
  securityText: { fontSize: 11, color: colors.auth.placeholder, fontWeight: '500' },

});
