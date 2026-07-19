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

import { AppAlert, AlertConfig } from '@/components/AppAlert';
import { colors } from '@/theme/colors';
import { sendPasswordResetEmail } from '@/services/brevo';
import { apiCheckEmail } from '@/services/api';
import { setItem } from '@/utils/storage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const OTP_CODE_KEY   = 'floodtrack_reset_otp';
export const OTP_EMAIL_KEY  = 'floodtrack_reset_email';
export const OTP_EXPIRY_KEY = 'floodtrack_reset_expiry';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp(): string {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const heroOpacity  = useRef(new Animated.Value(0)).current;
  const heroTransY   = useRef(new Animated.Value(-20)).current;
  const formOpacity  = useRef(new Animated.Value(0)).current;
  const formTransY   = useRef(new Animated.Value(50)).current;
  const fieldOpacity = useRef(new Animated.Value(0)).current;
  const fieldTransX  = useRef(new Animated.Value(-30)).current;
  const btnOpacity   = useRef(new Animated.Value(0)).current;
  const btnScale     = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(heroTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(fieldOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(fieldTransX,  { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(btnScale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const [email, setEmail]           = useState('');
  const [emailFocus, setEmailFocus] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [sent, setSent]             = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  const successScale   = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successTransY  = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (!sent) return;
    Animated.stagger(60, [
      Animated.spring(successScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(successTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
    ]).start();
  }, [sent]);

  const emailGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(emailGlow, { toValue: emailFocus ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [emailFocus]);

  const emailValid   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showEmailErr = emailTouched && !emailValid;
  const emailBorder  = showEmailErr
    ? colors.feedback.error
    : emailGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', colors.auth.primary] });

  const handleSend = useCallback(async () => {
    if (!email.trim()) {
      setAlertConfig({ type: 'warning', title: 'Email Required', message: 'Please enter your email address.', confirmText: 'OK' });
      return;
    }
    if (!emailValid) {
      setAlertConfig({ type: 'warning', title: 'Invalid Email', message: 'Please enter a valid email address.', confirmText: 'OK' });
      return;
    }
    setIsLoading(true);
    try {
      const exists = await apiCheckEmail(email.trim());
      if (!exists) {
        setAlertConfig({
          type: 'error',
          title: 'Email Not Found',
          message: 'No account is registered with this email address.',
          confirmText: 'OK',
        });
        return;
      }

      const otp    = generateOtp();
      const expiry = (Date.now() + OTP_TTL_MS).toString();
      await Promise.all([
        setItem(OTP_CODE_KEY,   otp),
        setItem(OTP_EMAIL_KEY,  email.trim()),
        setItem(OTP_EXPIRY_KEY, expiry),
      ]);
      await sendPasswordResetEmail(email.trim(), otp);
      setSent(true);
    } catch (e: any) {
      setAlertConfig({
        type: 'error',
        title: 'Failed to Send',
        message: e?.message ?? 'Unable to send reset code. Please try again.',
        confirmText: 'OK',
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, emailValid]);

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroTransY }] }}>
          <LinearGradient
            colors={colors.gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.hero, { paddingTop: insets.top + 8 }]}
          >
            <View style={[s.orb, s.orb1]} />
            <View style={[s.orb, s.orb2]} />

            <Particle delay={200}  x={SCREEN_W * 0.1}  y={36} size={3} />
            <Particle delay={900}  x={SCREEN_W * 0.82} y={50} size={4} />
            <Particle delay={1400} x={SCREEN_W * 0.45} y={28} size={3} />

            <Pressable
              onPress={() => router.back()}
              style={[s.backBtn, { top: insets.top + 12 }]}
              hitSlop={10}
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </Pressable>

            <View style={s.iconBadge}>
              <View style={s.iconBadgeInner}>
                <Ionicons name="mail-open-outline" size={38} color={colors.white} />
              </View>
              <View style={s.iconBadgeRing} />
            </View>

            <Text style={s.heroTitle}>Forgot Password?</Text>
            <Text style={s.heroSub}>We'll email you a 6-digit reset code</Text>
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
            {sent ? (
              /* ── Success state ── */
              <View style={s.successWrap}>
                <Animated.View style={[s.successIconCircle, { transform: [{ scale: successScale }] }]}>
                  <LinearGradient
                    colors={['#48BB78', '#38A169']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.successIconGradient}
                  >
                    <Ionicons name="checkmark" size={40} color={colors.white} />
                  </LinearGradient>
                </Animated.View>

                <Animated.View style={{ opacity: successOpacity, transform: [{ translateY: successTransY }], alignItems: 'center' }}>
                  <Text style={s.successTitle}>Email Sent!</Text>
                  <Text style={s.successBody}>
                    We sent a 6-digit reset code to{'\n'}
                    <Text style={s.successEmail}>{email.trim()}</Text>
                  </Text>
                  <Text style={s.successHint}>Check your inbox and spam folder.</Text>

                  <Pressable
                    onPress={() => router.push('/reset-password')}
                    style={({ pressed }) => [{ width: '100%', marginTop: 32 }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                    accessibilityRole="button"
                  >
                    <LinearGradient
                      colors={colors.gradients.cta}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.actionBtn}
                    >
                      <Text style={s.actionBtnText}>Enter Code</Text>
                      <View style={s.actionBtnArrow}>
                        <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                      </View>
                    </LinearGradient>
                  </Pressable>

                  <Pressable onPress={() => setSent(false)} style={s.retrySendBtn} hitSlop={8}>
                    <Text style={s.retrySendText}>Try a different email</Text>
                  </Pressable>
                </Animated.View>
              </View>
            ) : (
              /* ── Form ── */
              <>
                <Text style={s.titleBold}>Reset your{'\n'}password</Text>
                <Text style={s.titleSub}>
                  Enter your registered email address and we'll send you a 6-digit code to reset your password.
                </Text>

                <Animated.View style={[s.fieldWrap, { opacity: fieldOpacity, transform: [{ translateX: fieldTransX }] }]}>
                  <Text style={s.fieldLabel}>Email address</Text>
                  <Animated.View style={[s.inputRow, { borderColor: emailBorder }, emailFocus && s.inputFocused]}>
                    <View style={[s.inputIconWrap, emailFocus && s.inputIconActive]}>
                      <Ionicons name="mail-outline" size={18} color={emailFocus ? colors.auth.primary : colors.auth.muted} />
                    </View>
                    <TextInput
                      style={s.input}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.auth.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setEmailFocus(true)}
                      onBlur={() => { setEmailFocus(false); setEmailTouched(true); }}
                    />
                  </Animated.View>
                  {emailTouched && email.length > 0 && !emailValid && (
                    <View style={s.errorRow}>
                      <Ionicons name="alert-circle-outline" size={13} color={colors.feedback.error} />
                      <Text style={s.errorText}>Please enter a valid email address.</Text>
                    </View>
                  )}
                  {emailTouched && email.length === 0 && (
                    <View style={s.errorRow}>
                      <Ionicons name="alert-circle-outline" size={13} color={colors.feedback.error} />
                      <Text style={s.errorText}>Email address is required.</Text>
                    </View>
                  )}
                </Animated.View>

                <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnScale }], marginTop: 10 }}>
                  <Pressable
                    onPress={handleSend}
                    disabled={isLoading}
                    style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                    accessibilityRole="button"
                    accessibilityLabel="Send reset code"
                  >
                    <LinearGradient
                      colors={isLoading ? colors.gradients.ctaDisabled : colors.gradients.cta}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.actionBtn}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Text style={s.actionBtnText}>Send Reset Code</Text>
                          <View style={s.actionBtnArrow}>
                            <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                          </View>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                <View style={s.footer}>
                  <Text style={s.footerText}>Remember your password?</Text>
                  <Pressable onPress={() => router.back()} hitSlop={8}>
                    <Text style={s.footerLink}> Sign In</Text>
                  </Pressable>
                </View>
              </>
            )}
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
    height: SCREEN_H * 0.24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 28,
    overflow: 'hidden',
  },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin },
  orb1: { width: 180, height: 180, top: -50, right: -40 },
  orb2: { width: 110, height: 110, bottom: 8, left: -30, backgroundColor: colors.overlay.whiteSubtle },

  backBtn: {
    position: 'absolute', left: 18,
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.overlay.whiteSoft,
    alignItems: 'center', justifyContent: 'center',
  },

  iconBadge: { alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  iconBadgeInner: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: colors.overlay.whiteRegular,
    borderWidth: 1.5, borderColor: colors.overlay.whiteFirm,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBadgeRing: {
    position: 'absolute', width: 92, height: 92, borderRadius: 46,
    borderWidth: 1, borderColor: colors.overlay.whiteLight,
  },
  heroTitle: { fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: 1 },
  heroSub:   { fontSize: 12, color: colors.overlay.whiteSub, marginTop: 5, letterSpacing: 0.5 },

  waveWrap: { height: 44, position: 'relative', marginTop: -1 },
  waveShape: {
    position: 'absolute', bottom: 0, left: -12, right: -12, height: 55,
    backgroundColor: colors.auth.pageBg,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
  },

  formArea: { flex: 1, backgroundColor: colors.auth.pageBg, marginTop: -2 },
  formScroll: { paddingHorizontal: 28, paddingTop: 10 },

  titleBold: { fontSize: 24, fontWeight: '800', color: colors.auth.heading, marginBottom: 8, lineHeight: 32 },
  titleSub:  { fontSize: 13, color: colors.auth.muted, marginBottom: 20, lineHeight: 19 },

  fieldWrap:     { marginBottom: 6 },
  fieldLabel:    { fontSize: 13, fontWeight: '600', color: colors.auth.tertiary, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 50, borderRadius: 14,
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
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.auth.inputIconBg,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  inputIconActive: { backgroundColor: colors.auth.inputIconActive },
  input: { flex: 1, fontSize: 15, color: colors.auth.heading, paddingHorizontal: 12, height: '100%' },
  actionBtn: {
    height: 52, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 10,
  },
  actionBtnText:  { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  actionBtnArrow: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: colors.overlay.whiteBright,
    alignItems: 'center', justifyContent: 'center',
  },

  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 14, color: colors.auth.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: colors.auth.primary },

  // ── Success ───────────────────────────────────────────────────────────────
  successWrap: { alignItems: 'center', paddingTop: 12 },
  successIconCircle: {
    width: 88, height: 88, borderRadius: 44,
    marginBottom: 24,
    shadowColor: '#48BB78',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  successIconGradient: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: {
    fontSize: 26, fontWeight: '900', color: colors.auth.heading,
    marginBottom: 12, textAlign: 'center',
  },
  successBody: {
    fontSize: 15, color: colors.auth.muted,
    textAlign: 'center', lineHeight: 22, marginBottom: 6,
  },
  successEmail: { fontWeight: '700', color: colors.auth.primary },
  successHint: {
    fontSize: 13, color: colors.auth.placeholder,
    textAlign: 'center',
  },
  retrySendBtn: { marginTop: 16, alignSelf: 'center' },
  retrySendText: { fontSize: 13, color: colors.auth.muted, fontWeight: '600', textDecorationLine: 'underline' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 2 },
  errorText: { fontSize: 12, color: colors.feedback.error, fontWeight: '500' },
});
