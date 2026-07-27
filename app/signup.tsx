import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { AppAlert, AlertConfig } from '@/components/AppAlert';
import { colors } from '@/theme/colors';
import { apiCheckEmail, apiRegister, apiDeleteAccount, apiMarkEmailVerified } from '@/services/api';
import { sendEmailVerificationOtp } from '@/services/brevo';

const { width: INIT_W, height: INIT_H } = Dimensions.get('window');
const HERO_H = INIT_H * 0.22;


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
  const { login } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const heroH = Math.min(screenH * 0.22, 200);
  const isSmall = screenH < 700;

  // ── Entrance animations ──────────────────────────────────────────────────
  const heroOpacity  = useRef(new Animated.Value(0)).current;
  const heroScale    = useRef(new Animated.Value(1.05)).current;
  const formOpacity  = useRef(new Animated.Value(0)).current;
  const formTransY   = useRef(new Animated.Value(50)).current;

  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const btnScale      = useRef(new Animated.Value(0.85)).current;
  const socialOpacity = useRef(new Animated.Value(0)).current;
  const socialTransY  = useRef(new Animated.Value(15)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(60, [
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(heroScale,   { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
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


  const [isLoading, setIsLoading]               = useState(false);
  const [isGoogleLoading, setIsGoogleLoading]   = useState(false);
  const [alertConfig, setAlertConfig]           = useState<AlertConfig | null>(null);

  // Pending auth (held until OTP verified)
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  // OTP verification
  const [showOtp, setShowOtp]           = useState(false);
  const [otpDigits, setOtpDigits]       = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading]     = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpError, setOtpError]         = useState('');
  const [otpCooldown, setOtpCooldown]   = useState(0);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const otpFadeAnim = useRef(new Animated.Value(0)).current;
  const otpSlideAnim = useRef(new Animated.Value(300)).current;
  const generatedOtp = useRef('');

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
    setIsLoading(true);
    try {
      const emailTaken = await apiCheckEmail(email.trim());
      if (emailTaken) {
        setAlertConfig({ type: 'error', title: 'Email Already Registered', message: 'An account with this email already exists. Please log in or use a different email.', confirmText: 'OK' });
        return;
      }
    } catch {
      // network error — let the server catch it on submit
    } finally {
      setIsLoading(false);
    }
    const phone = '09' + contact.replace(/[^0-9]/g, '');
    if (contact.length !== 9) {
      setAlertConfig({ type: 'warning', title: 'Invalid Number', message: 'Enter 9 digits after 09.', confirmText: 'OK' });
      return;
    }
    if (!password || password.length < 8 || password.length > 16) {
      setAlertConfig({ type: 'warning', title: 'Invalid Password', message: 'Password must be between 8 and 16 characters.', confirmText: 'OK' });
      return;
    }
    if (confirmPassword !== password) {
      setAlertConfig({ type: 'warning', title: 'Passwords Don\'t Match', message: 'Please make sure both passwords are the same.', confirmText: 'OK' });
      return;
    }
    setIsLoading(true);
    try {
      const { token: t } = await apiRegister({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        contact: phone,
        password,
        role,
      });
      // Hold the token — don't persist yet (prevents auto-navigation)
      setPendingToken(t);
      // Generate OTP and send via Brevo
      const otp = Math.floor(100_000 + Math.random() * 900_000).toString();
      generatedOtp.current = otp;
      try { await sendEmailVerificationOtp(email.trim(), otp); } catch {}
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError('');
      setShowOtp(true);
      setOtpCooldown(60);
      otpSlideAnim.setValue(300);
      otpFadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(otpSlideAnim, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
        Animated.timing(otpFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      setTimeout(() => otpRefs.current[0]?.focus(), 400);
    } catch (e: any) {
      setAlertConfig({ type: 'error', title: 'Registration Failed', message: e?.message ?? 'Something went wrong. Please try again.', confirmText: 'Try Again' });
    } finally {
      setIsLoading(false);
    }
  }, [firstName, lastName, email, contact, password, confirmPassword, role, otpSlideAnim, otpFadeAnim]);

  // ── OTP cooldown timer ──
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  function handleOtpChange(text: string, idx: number) {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otpDigits];
    next[idx] = digit;
    setOtpDigits(next);
    setOtpError('');
    if (digit && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (digit && idx === 5 && next.every(d => d)) {
      handleOtpSubmit(next.join(''));
    }
  }

  function handleOtpKeyPress(key: string, idx: number) {
    if (key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      const next = [...otpDigits];
      next[idx - 1] = '';
      setOtpDigits(next);
      otpRefs.current[idx - 1]?.focus();
    }
  }

  async function handleOtpSubmit(code?: string) {
    const otp = code ?? otpDigits.join('');
    if (otp.length !== 6) {
      setOtpError('Please enter all 6 digits');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      if (otp !== generatedOtp.current) {
        throw new Error('Invalid code. Please try again.');
      }
      // Mark email as verified in the backend
      if (pendingToken) {
        await apiMarkEmailVerified(pendingToken);
      }
      // Email verified — now log in to persist auth and navigate
      await login({ email: email.trim(), password });
      setShowOtp(false);
    } catch (e: any) {
      setOtpError(e?.message ?? 'Invalid code. Please try again.');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    if (otpCooldown > 0 || otpResending) return;
    setOtpResending(true);
    try {
      const otp = Math.floor(100_000 + Math.random() * 900_000).toString();
      generatedOtp.current = otp;
      await sendEmailVerificationOtp(email.trim(), otp);
      setOtpCooldown(60);
      setOtpError('');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setOtpError('Failed to resend code.');
    } finally {
      setOtpResending(false);
    }
  }

  async function handleCancelOtp() {
    if (pendingToken) {
      try { await apiDeleteAccount(pendingToken); } catch {}
    }
    setPendingToken(null);
    setShowOtp(false);
    generatedOtp.current = '';
  }

  const handleGoogleSignUp = useCallback(async () => {
    setIsGoogleLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setAlertConfig({ type: 'info', title: 'Coming Soon', message: 'Google sign-up is not yet configured.', confirmText: 'OK' });
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

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
            style={[s.hero, { height: heroH, paddingTop: insets.top + 8, paddingBottom: isSmall ? 20 : 36 }]}
          >
            <View style={[s.orb, s.orb1]} />
            <View style={[s.orb, s.orb2]} />
            <View style={[s.orb, s.orb3, { left: screenW * 0.55 }]} />

            <Particle delay={200}  x={screenW * 0.1}  y={40} size={3} />
            <Particle delay={800}  x={screenW * 0.85} y={60} size={4} />
            <Particle delay={1200} x={screenW * 0.4}  y={30} size={3} />

            <View style={isSmall ? s.logoBadgeSmall : s.logoBadge}>
              <View style={isSmall ? s.logoBadgeInnerSmall : s.logoBadgeInner}>
                <Image source={require('@/assets/images/logo-water.png')} style={{ width: isSmall ? 40 : 64, height: isSmall ? 40 : 64 }} resizeMode="contain" />
              </View>
              {!isSmall && <View style={s.logoBadgeRing} />}
            </View>

            <Text style={[s.logoTitle, isSmall && { fontSize: 18, letterSpacing: 3 }]}>FLOODTRACK</Text>
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
              <Text style={[s.titleBold, isSmall && { fontSize: 24 }]}>Create </Text>
              <Text style={[s.titleLight, isSmall && { fontSize: 24 }]}>account</Text>
            </View>
            <Text style={[s.titleSub, isSmall && { marginBottom: 8 }]}>Fill in the details to get started</Text>

            {/* First + Last name */}
            <View style={s.nameRow}>
              <View style={s.nameHalf}>
                <View style={s.inputRow}>
                  <View style={s.inputIconWrap}>
                    <Ionicons name="person-outline" size={18} color={colors.auth.muted} />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="First name"
                    placeholderTextColor={colors.auth.placeholder}
                    autoCapitalize="words"
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                </View>
              </View>

              <View style={s.nameHalf}>
                <View style={s.inputRow}>
                  <View style={s.inputIconWrap}>
                    <Ionicons name="person-outline" size={18} color={colors.auth.muted} />
                  </View>
                  <TextInput
                    style={s.input}
                    placeholder="Last name"
                    placeholderTextColor={colors.auth.placeholder}
                    autoCapitalize="words"
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              </View>
            </View>

            {/* Email */}
            <View style={s.fieldWrap}>
              <View style={s.inputRow}>
                <View style={s.inputIconWrap}>
                  <Ionicons name="mail-outline" size={18} color={colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Email address"
                  placeholderTextColor={colors.auth.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            {/* Mobile */}
            <View style={s.fieldWrap}>
              <View style={s.inputRow}>
                <View style={s.inputIconWrap}>
                  <Ionicons name="call-outline" size={18} color={colors.auth.muted} />
                </View>
                <Text style={{ fontSize: 15, color: colors.auth.heading, marginLeft: 12 }}>09</Text>
                <TextInput
                  style={[s.input, { paddingLeft: 2 }]}
                  placeholder="XX XXX XXXX"
                  placeholderTextColor={colors.auth.placeholder}
                  keyboardType="phone-pad"
                  value={contact}
                  onChangeText={(t) => setContact(t.replace(/[^0-9]/g, '').slice(0, 9))}
                  maxLength={9}
                />
              </View>
            </View>

            {/* Password */}
            <View style={s.fieldWrap}>
              <View style={s.inputRow}>
                <View style={s.inputIconWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Password (8–16 chars)"
                  placeholderTextColor={colors.auth.placeholder}
                  secureTextEntry={!showPassword}
                  maxLength={16}
                  value={password}
                  onChangeText={setPassword}
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
            </View>

            {/* Confirm password */}
            <View style={s.fieldWrap}>
              <View style={s.inputRow}>
                <View style={s.inputIconWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.auth.muted} />
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.auth.placeholder}
                  secureTextEntry={!showConfirm}
                  maxLength={16}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <Pressable onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn} hitSlop={8} accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.auth.muted} />
                </Pressable>
              </View>
            </View>

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

      {/* ── OTP Verification Modal ── */}
      <Modal transparent visible={showOtp} animationType="none" onRequestClose={handleCancelOtp}>
        <Animated.View style={[otp.backdrop, { opacity: otpFadeAnim }]}>
          <Animated.View style={[otp.sheet, { transform: [{ translateY: otpSlideAnim }] }]}>
            {/* Accent bar */}
            <LinearGradient
              colors={[colors.auth.primary, '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={otp.accent}
            />
            <View style={otp.handle} />

            {/* Icon */}
            <View style={otp.iconWrap}>
              <LinearGradient
                colors={[colors.auth.primary, '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={otp.iconGrad}
              >
                <Ionicons name="mail-outline" size={28} color="#fff" />
              </LinearGradient>
            </View>

            <Text style={otp.title}>Verify your email</Text>
            <Text style={otp.sub}>
              We sent a 6-digit code to{'\n'}
              <Text style={otp.emailHighlight}>{email.trim()}</Text>
            </Text>

            {/* OTP inputs */}
            <View style={otp.digitRow}>
              {otpDigits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={r => { otpRefs.current[i] = r; }}
                  style={[
                    otp.digitInput,
                    d ? otp.digitFilled : null,
                    otpError ? otp.digitError : null,
                  ]}
                  value={d}
                  onChangeText={t => handleOtpChange(t, i)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  editable={!otpLoading}
                />
              ))}
            </View>

            {otpError ? (
              <View style={otp.errorRow}>
                <Ionicons name="alert-circle" size={13} color={colors.feedback.error} />
                <Text style={otp.errorText}>{otpError}</Text>
              </View>
            ) : null}

            {/* Verify button */}
            <Pressable
              onPress={() => handleOtpSubmit()}
              disabled={otpLoading || otpDigits.some(d => !d)}
              style={({ pressed }) => [
                otp.verifyBtn,
                (otpLoading || otpDigits.some(d => !d)) && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={[colors.auth.primary, '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={otp.verifyGrad}
              >
                {otpLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={otp.verifyText}>Verify Email</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            {/* Resend */}
            <View style={otp.resendRow}>
              <Text style={otp.resendLabel}>Didn't receive it?</Text>
              {otpCooldown > 0 ? (
                <Text style={otp.resendCooldown}>Resend in {otpCooldown}s</Text>
              ) : (
                <Pressable onPress={handleResendOtp} disabled={otpResending}>
                  <Text style={otp.resendLink}>
                    {otpResending ? 'Sending...' : 'Resend Code'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Cancel */}
            <Pressable onPress={handleCancelOtp} style={({ pressed }) => [otp.cancelBtn, pressed && { opacity: 0.7 }]}>
              <Text style={otp.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Modal>
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
  orb3: { width: 80, height: 80, top: 40, backgroundColor: colors.overlay.whiteFaint },

  logoBadge: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoBadgeSmall: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  logoBadgeInner: {
    width: 100, height: 100, borderRadius: 30,
    backgroundColor: colors.overlay.whiteRegular,
    borderWidth: 1.5, borderColor: colors.overlay.whiteFirm,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeInnerSmall: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: colors.overlay.whiteRegular,
    borderWidth: 1.5, borderColor: colors.overlay.whiteFirm,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadgeRing: {
    position: 'absolute', width: 122, height: 122, borderRadius: 61,
    borderWidth: 1, borderColor: colors.overlay.whiteLight,
  },
  logoTitle: { fontSize: 24, fontWeight: '900', color: colors.white, letterSpacing: 5 },
  logoSub: { fontSize: 12, color: colors.overlay.whiteSub, marginTop: 6, letterSpacing: 1 },

  waveWrap: { height: 20, position: 'relative', marginTop: -1 },
  waveShape: {
    position: 'absolute', bottom: 0,
    left: -12, right: -12, height: 32,
    backgroundColor: colors.auth.pageBg,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
  },

  formArea: { flex: 1, backgroundColor: colors.auth.pageBg, marginTop: -2 },
  formScroll: { paddingHorizontal: 28, paddingTop: 4 },

  titleRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  titleBold: { fontSize: 30, fontWeight: '800', color: colors.auth.heading },
  titleLight: { fontSize: 30, fontWeight: '300', color: colors.auth.heading },
  titleSub: { fontSize: 14, color: colors.auth.muted, marginBottom: 14 },

  nameRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  nameHalf: { flex: 1 },

  fieldWrap: { marginBottom: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 56, borderRadius: 16,
    backgroundColor: colors.auth.inputBg,
    borderWidth: 1.5, borderColor: 'transparent',
    paddingHorizontal: 4,
    elevation: 0,
  },
  inputFocused: {
    backgroundColor: colors.white,
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 0,
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
    gap: 10, marginTop: 12,
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
    marginTop: 20, marginBottom: 12,
  },
  footerText: { fontSize: 14, color: colors.auth.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: colors.auth.primary },
});

const otp = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 28,
    paddingTop: 0,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 24,
  },
  accent: {
    height: 4,
    width: '100%',
    marginBottom: 16,
    marginHorizontal: -28,
    alignSelf: 'stretch',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconWrap: {
    marginBottom: 16,
  },
  iconGrad: {
    width: 60, height: 60, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.auth.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.slate[900],
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  emailHighlight: {
    fontWeight: '700',
    color: colors.slate[700],
  },
  digitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  digitInput: {
    width: 46,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: colors.slate[900],
  },
  digitFilled: {
    borderColor: colors.auth.primary,
    backgroundColor: colors.auth.primary + '08',
  },
  digitError: {
    borderColor: colors.feedback.error,
    backgroundColor: colors.feedback.error + '08',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.feedback.error,
  },
  verifyBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  verifyGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  verifyText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resendLabel: {
    fontSize: 12,
    color: colors.slate[400],
  },
  resendCooldown: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.slate[400],
  },
  resendLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.auth.primary,
  },
  cancelBtn: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[400],
  },
});
