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
import { apiResetPassword } from '@/services/api';
import { sendPasswordResetEmail } from '@/services/brevo';
import { getItem, deleteItem, setItem } from '@/utils/storage';
import { OTP_CODE_KEY, OTP_EMAIL_KEY, OTP_EXPIRY_KEY } from './forgot-password';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;

type Step = 'otp' | 'password';

function generateOtp(): string {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return email;
  return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 2))}${local[local.length - 1]}@${domain}`;
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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── Animations ────────────────────────────────────────────────────────────
  const heroOpacity   = useRef(new Animated.Value(0)).current;
  const heroTransY    = useRef(new Animated.Value(-20)).current;
  const formOpacity   = useRef(new Animated.Value(0)).current;
  const formTransY    = useRef(new Animated.Value(50)).current;
  const otpOpacity    = useRef(new Animated.Value(0)).current;
  const otpTransY     = useRef(new Animated.Value(20)).current;
  const btnOpacity    = useRef(new Animated.Value(0)).current;
  const btnScale      = useRef(new Animated.Value(0.85)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  // Step transition
  const stepTransX   = useRef(new Animated.Value(0)).current;
  const stepOpacity  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.stagger(70, [
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(heroTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(formTransY,  { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(otpOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(otpTransY,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(btnScale,   { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]),
      Animated.timing(footerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateToPasswordStep = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(stepOpacity,  { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(stepTransX,   { toValue: -40, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setStep('password');
      stepTransX.setValue(40);
      Animated.parallel([
        Animated.timing(stepOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(stepTransX,  { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    });
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const [step, setStep]                 = useState<Step>('otp');
  const [storedEmail, setStoredEmail]   = useState('');
  const verifiedOtpRef                  = useRef('');

  // OTP step
  const [digits, setDigits]             = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying]   = useState(false);
  const [isResending, setIsResending]   = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeOtpIdx, setActiveOtpIdx] = useState<number | null>(null);

  // Password step
  const [password, setPassword]         = useState('');
  const [confirmPwd, setConfirmPwd]     = useState('');
  const [pwdTouched, setPwdTouched]     = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPwd, setShowPwd]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [pwdFocus, setPwdFocus]         = useState(false);
  const [confirmFocus, setConfirmFocus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [alertConfig, setAlertConfig]   = useState<AlertConfig | null>(null);

  const otpRefs     = useRef<(TextInput | null)[]>([]);
  const pwdGlow     = useRef(new Animated.Value(0)).current;
  const confirmGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pwdGlow,     { toValue: pwdFocus     ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [pwdFocus]);
  useEffect(() => {
    Animated.timing(confirmGlow, { toValue: confirmFocus ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [confirmFocus]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const otpComplete    = digits.join('').length === OTP_LENGTH;
  const pwdValid       = password.length >= 8 && password.length <= 16;
  const confirmValid   = confirmPwd === password && confirmPwd.length > 0;

  const showPwdErr     = pwdTouched && !pwdValid;
  const showConfirmErr = confirmTouched && !confirmValid;

  const pwdBorder     = showPwdErr
    ? colors.feedback.error
    : pwdGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', colors.auth.primary] });
  const confirmBorder = showConfirmErr
    ? colors.feedback.error
    : confirmGlow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', colors.auth.primary] });

  const pwdLen          = password.length;
  const strength        = pwdLen === 0 ? 0 : pwdLen < 6 ? 1 : pwdLen < 10 ? 2 : 3;
  const strengthColors  = ['', colors.feedback.error, colors.feedback.passwordMedium, colors.feedback.success];
  const strengthLabels  = ['', 'Weak', 'Medium', 'Strong'];

  const startCooldown = () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    getItem(OTP_EMAIL_KEY).then(e => { if (e) setStoredEmail(e); });
    const t = setTimeout(() => { otpRefs.current[0]?.focus(); }, 600);
    startCooldown();
    return () => {
      clearTimeout(t);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ── OTP box handlers ──────────────────────────────────────────────────────
  const handleDigitChange = (text: string, idx: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next  = [...digits];
    next[idx]   = digit;
    setDigits(next);
    if (digit && idx < OTP_LENGTH - 1) {
      otpRefs.current[idx + 1]?.focus();
    }
  };

  const handleDigitKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = '';
      setDigits(next);
      otpRefs.current[idx - 1]?.focus();
    }
  };

  // ── Resend ────────────────────────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (!storedEmail) { router.replace('/forgot-password'); return; }
    setIsResending(true);
    try {
      const otp    = generateOtp();
      const expiry = (Date.now() + OTP_TTL_MS).toString();
      await Promise.all([
        setItem(OTP_CODE_KEY,   otp),
        setItem(OTP_EXPIRY_KEY, expiry),
      ]);
      await sendPasswordResetEmail(storedEmail, otp);
      setDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      startCooldown();
      setAlertConfig({ type: 'info', title: 'Code Resent', message: `A new code was sent to ${maskEmail(storedEmail)}.`, confirmText: 'OK' });
    } catch (e: any) {
      setAlertConfig({ type: 'error', title: 'Resend Failed', message: e?.message ?? 'Could not resend code. Try again.', confirmText: 'OK' });
    } finally {
      setIsResending(false);
    }
  }, [storedEmail]);

  // ── Step 1: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = useCallback(async () => {
    const enteredOtp = digits.join('');
    if (enteredOtp.length < OTP_LENGTH) {
      setAlertConfig({ type: 'warning', title: 'Code Incomplete', message: 'Please enter the full 6-digit code.', confirmText: 'OK' });
      return;
    }

    setIsVerifying(true);
    try {
      const [storedOtp, expiry] = await Promise.all([
        getItem(OTP_CODE_KEY),
        getItem(OTP_EXPIRY_KEY),
      ]);

      if (!storedOtp) {
        setAlertConfig({ type: 'error', title: 'Session Expired', message: 'Your reset session has expired. Please request a new code.', confirmText: 'OK' });
        return;
      }
      if (expiry && Date.now() > parseInt(expiry, 10)) {
        setAlertConfig({
          type: 'error',
          title: 'Code Expired',
          message: 'Your reset code has expired. Please request a new one.',
          confirmText: 'Request New Code',
          onConfirm: () => router.replace('/forgot-password'),
        });
        return;
      }
      if (enteredOtp !== storedOtp) {
        setAlertConfig({ type: 'error', title: 'Incorrect Code', message: 'The code you entered is incorrect. Please check your email and try again.', confirmText: 'Try Again' });
        return;
      }

      // OTP valid — save and move to password step
      verifiedOtpRef.current = enteredOtp;
      animateToPasswordStep();
    } finally {
      setIsVerifying(false);
    }
  }, [digits, storedEmail]);

  // ── Step 2: Reset Password ────────────────────────────────────────────────
  const handleResetPassword = useCallback(async () => {
    setPwdTouched(true);
    setConfirmTouched(true);

    if (!pwdValid) {
      setAlertConfig({ type: 'warning', title: 'Password Too Short', message: 'Password must be at least 6 characters.', confirmText: 'OK' });
      return;
    }
    if (!confirmValid) {
      setAlertConfig({ type: 'error', title: 'Passwords Don\'t Match', message: 'Make sure both password fields are the same.', confirmText: 'OK' });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiResetPassword(storedEmail, verifiedOtpRef.current, password);
      await Promise.all([
        deleteItem(OTP_CODE_KEY),
        deleteItem(OTP_EMAIL_KEY),
        deleteItem(OTP_EXPIRY_KEY),
      ]);
      setAlertConfig({
        type: 'success',
        title: 'Password Reset!',
        message: 'Your password has been updated successfully.',
        timer: 2000,
        onConfirm: () => router.replace('/login'),
      });
    } catch (e: any) {
      setAlertConfig({ type: 'error', title: 'Reset Failed', message: e?.message ?? 'Could not reset your password. Please try again.', confirmText: 'OK' });
    } finally {
      setIsSubmitting(false);
    }
  }, [password, confirmPwd, pwdValid, confirmValid, storedEmail]);

  // ── Main screen ───────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Hero */}
        <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroTransY }] }}>
          <LinearGradient
            colors={colors.gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.hero, { paddingTop: insets.top + 8 }]}
          >
            <View style={[s.orb, s.orb1]} />
            <View style={[s.orb, s.orb2]} />

            <Particle delay={300}  x={SCREEN_W * 0.08} y={38} size={3} />
            <Particle delay={800}  x={SCREEN_W * 0.80} y={52} size={4} />
            <Particle delay={1500} x={SCREEN_W * 0.50} y={26} size={3} />

            {/* Step indicator */}
            <View style={s.stepPills}>
              <View style={[s.stepPill, s.stepPillActive]} />
              <View style={[s.stepPill, step === 'password' && s.stepPillActive]} />
            </View>

            <View style={s.iconBadge}>
              <View style={s.iconBadgeInner}>
                <Ionicons
                  name={step === 'otp' ? 'keypad-outline' : 'lock-open-outline'}
                  size={36}
                  color={colors.white}
                />
              </View>
              <View style={s.iconBadgeRing} />
            </View>

            <Text style={s.heroTitle}>
              {step === 'otp' ? 'Verify Code' : 'New Password'}
            </Text>
            <Text style={s.heroSub}>
              {step === 'otp'
                ? storedEmail ? `Code sent to ${maskEmail(storedEmail)}` : 'Enter the code from your email'
                : 'Choose a strong new password'}
            </Text>
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
            <Animated.View style={{ opacity: stepOpacity, transform: [{ translateX: stepTransX }] }}>

              {/* ── STEP 1: OTP ── */}
              {step === 'otp' && (
                <>
                  <Text style={s.sectionTitle}>Verification Code</Text>
                  <Text style={s.sectionSub}>Enter the 6-digit code we sent to your inbox.</Text>

                  <Animated.View style={[s.otpRow, { opacity: otpOpacity, transform: [{ translateY: otpTransY }] }]}>
                    {digits.map((d, i) => (
                      <Pressable
                        key={i}
                        onPress={() => otpRefs.current[i]?.focus()}
                        style={[
                          s.otpBox,
                          activeOtpIdx === i && s.otpBoxActive,
                          d !== '' && s.otpBoxFilled,
                        ]}
                      >
                        <TextInput
                          ref={ref => { otpRefs.current[i] = ref; }}
                          style={s.otpInput}
                          value={d}
                          onChangeText={t => handleDigitChange(t, i)}
                          onKeyPress={({ nativeEvent }) => handleDigitKeyPress(nativeEvent.key, i)}
                          onFocus={() => setActiveOtpIdx(i)}
                          onBlur={() => setActiveOtpIdx(null)}
                          keyboardType="number-pad"
                          maxLength={1}
                          selectTextOnFocus
                          caretHidden
                          accessibilityLabel={`Digit ${i + 1}`}
                        />
                      </Pressable>
                    ))}
                  </Animated.View>

                  <View style={s.resendRow}>
                    <Text style={s.resendLabel}>Didn't receive a code?</Text>
                    {isResending ? (
                      <ActivityIndicator size="small" color={colors.auth.primary} style={{ marginLeft: 6 }} />
                    ) : resendCooldown > 0 ? (
                      <Text style={s.resendCooldown}> Resend in {resendCooldown}s</Text>
                    ) : (
                      <Pressable onPress={handleResend} hitSlop={8}>
                        <Text style={s.resendLink}> Resend</Text>
                      </Pressable>
                    )}
                  </View>

                  <Animated.View style={{ opacity: btnOpacity, transform: [{ scale: btnScale }], marginTop: 4 }}>
                    <Pressable
                      onPress={handleVerifyOtp}
                      disabled={isVerifying}
                      style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={isVerifying ? colors.gradients.ctaDisabled : colors.gradients.cta}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={s.actionBtn}
                      >
                        {isVerifying ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <>
                            <Text style={s.actionBtnText}>Verify Code</Text>
                            <View style={s.actionBtnArrow}>
                              <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                            </View>
                          </>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>
                </>
              )}

              {/* ── STEP 2: New Password ── */}
              {step === 'password' && (
                <>
                  <Text style={s.sectionTitle}>Set New Password</Text>
                  <Text style={s.sectionSub}>Choose a strong password for your account.</Text>

                  {/* New password */}
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>New password</Text>
                    <Animated.View style={[s.inputRow, { borderColor: pwdBorder }, pwdFocus && s.inputFocused]}>
                      <View style={[s.inputIconWrap, pwdFocus && s.inputIconActive]}>
                        <Ionicons name="lock-closed-outline" size={18} color={pwdFocus ? colors.auth.primary : colors.auth.muted} />
                      </View>
                      <TextInput
                        style={s.input}
                        placeholder="New password (8–16 chars)"
                        placeholderTextColor={colors.auth.placeholder}
                        secureTextEntry={!showPwd}
                        textContentType="newPassword"
                        maxLength={16}
                        value={password}
                        onChangeText={setPassword}
                        onFocus={() => setPwdFocus(true)}
                        onBlur={() => { setPwdFocus(false); setPwdTouched(true); }}
                        autoFocus
                      />
                      <Pressable onPress={() => setShowPwd(v => !v)} style={s.eyeBtn} hitSlop={8}>
                        <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.auth.muted} />
                      </Pressable>
                    </Animated.View>
                    {showPwdErr && (
                      <View style={s.errorRow}>
                        <Ionicons name="alert-circle-outline" size={13} color={colors.feedback.error} />
                        <Text style={s.errorText}>
                          {password.length === 0 ? 'Password is required.' : 'Password must be between 8 and 16 characters.'}
                        </Text>
                      </View>
                    )}
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
                    <Text style={s.fieldLabel}>Confirm password</Text>
                    <Animated.View style={[s.inputRow, { borderColor: confirmBorder }, confirmFocus && s.inputFocused]}>
                      <View style={[s.inputIconWrap, confirmFocus && s.inputIconActive]}>
                        <Ionicons name="shield-checkmark-outline" size={18} color={confirmFocus ? colors.auth.primary : colors.auth.muted} />
                      </View>
                      <TextInput
                        style={s.input}
                        placeholder="Repeat password"
                        placeholderTextColor={colors.auth.placeholder}
                        secureTextEntry={!showConfirm}
                        textContentType="newPassword"
                        maxLength={16}
                        value={confirmPwd}
                        onChangeText={setConfirmPwd}
                        onFocus={() => setConfirmFocus(true)}
                        onBlur={() => { setConfirmFocus(false); setConfirmTouched(true); }}
                      />
                      <Pressable onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn} hitSlop={8}>
                        <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.auth.muted} />
                      </Pressable>
                    </Animated.View>
                    {showConfirmErr && (
                      <View style={s.errorRow}>
                        <Ionicons name="alert-circle-outline" size={13} color={colors.feedback.error} />
                        <Text style={s.errorText}>
                          {confirmPwd.length === 0 ? 'Please confirm your password.' : 'Passwords do not match.'}
                        </Text>
                      </View>
                    )}
                    {confirmTouched && confirmValid && (
                      <View style={s.errorRow}>
                        <Ionicons name="checkmark-circle-outline" size={13} color={colors.feedback.success} />
                        <Text style={[s.errorText, { color: colors.feedback.success }]}>Passwords match.</Text>
                      </View>
                    )}
                  </View>

                  <Pressable
                    onPress={handleResetPassword}
                    disabled={isSubmitting}
                    style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, { marginTop: 8 }]}
                    accessibilityRole="button"
                  >
                    <LinearGradient
                      colors={isSubmitting ? colors.gradients.ctaDisabled : colors.gradients.cta}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.actionBtn}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Text style={s.actionBtnText}>Reset Password</Text>
                          <View style={s.actionBtnArrow}>
                            <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
                          </View>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </>
              )}

              {/* Footer */}
              <Animated.View style={[s.footer, { opacity: footerOpacity }]}>
                <Text style={s.footerText}>Remember your password?</Text>
                <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
                  <Text style={s.footerLink}> Sign In</Text>
                </Pressable>
              </Animated.View>

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

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    height: SCREEN_H * 0.23,
    alignItems: 'center', justifyContent: 'center',
    paddingBottom: 26, overflow: 'hidden',
  },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin },
  orb1: { width: 180, height: 180, top: -50, right: -40 },
  orb2: { width: 110, height: 110, bottom: 8, left: -30, backgroundColor: colors.overlay.whiteSubtle },

  stepPills: {
    position: 'absolute', top: 16, flexDirection: 'row', gap: 6,
  },
  stepPill: {
    width: 20, height: 4, borderRadius: 2,
    backgroundColor: colors.overlay.whiteLight,
  },
  stepPillActive: {
    backgroundColor: colors.white, width: 32,
  },

  iconBadge:      { alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
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
  heroSub:   { fontSize: 12, color: colors.overlay.whiteSub, marginTop: 5, letterSpacing: 0.3 },

  waveWrap: { height: 20, position: 'relative', marginTop: -1 },
  waveShape: {
    position: 'absolute', bottom: 0, left: -12, right: -12, height: 32,
    backgroundColor: colors.auth.pageBg,
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
  },

  // ── Form ──────────────────────────────────────────────────────────────────
  formArea:   { flex: 1, backgroundColor: colors.auth.pageBg, marginTop: -2 },
  formScroll: { paddingHorizontal: 28, paddingTop: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.auth.heading, marginBottom: 3 },
  sectionSub:   { fontSize: 13, color: colors.auth.muted, marginBottom: 16 },

  // ── OTP boxes ─────────────────────────────────────────────────────────────
  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 14 },
  otpBox: {
    width: (SCREEN_W - 56 - 50) / 6,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: colors.auth.inputBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  otpBoxActive: {
    borderColor: colors.auth.primary,
    backgroundColor: colors.white,
    shadowColor: colors.auth.primary,
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 4,
  },
  otpBoxFilled: {
    borderColor: colors.auth.primary,
    backgroundColor: '#EBF0FF',
  },
  otpInput: {
    fontSize: 22, fontWeight: '800', color: colors.auth.heading,
    textAlign: 'center', width: '100%', height: '100%',
  },

  resendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  resendLabel:    { fontSize: 13, color: colors.auth.muted },
  resendLink:     { fontSize: 13, fontWeight: '700', color: colors.auth.primary },
  resendCooldown: { fontSize: 13, fontWeight: '600', color: colors.auth.placeholder },

  // ── Fields ────────────────────────────────────────────────────────────────
  fieldWrap:  { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.auth.tertiary, marginBottom: 8 },
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
  input:  { flex: 1, fontSize: 15, color: colors.auth.heading, paddingHorizontal: 12, height: '100%' },
  eyeBtn: { paddingHorizontal: 12 },

  strengthRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, paddingHorizontal: 2 },
  strengthTrack: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar:   { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700' },

  errorRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 2 },
  errorText: { fontSize: 12, color: colors.feedback.error, fontWeight: '500' },

  // ── Button ────────────────────────────────────────────────────────────────
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

  // ── Footer ────────────────────────────────────────────────────────────────
  footer:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 14, color: colors.auth.muted },
  footerLink: { fontSize: 14, fontWeight: '800', color: colors.auth.primary },

});
