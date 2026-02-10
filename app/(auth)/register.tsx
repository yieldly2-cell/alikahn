import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";

type Step = "info" | "otp" | "password";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const [step, setStep] = useState<Step>("info");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(TextInput | null)[]>([]);
  const [otpSent, setOtpSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  function startResendTimer() {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendOTP() {
    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/send-otp", baseUrl);
      const res = await expoFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to send verification code");
      }
      setOtpSent(true);
      setStep("otp");
      startResendTimer();
    } catch (err: any) {
      setError(err.message || "Failed to send verification code");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOTP() {
    if (resendTimer > 0) return;
    setError("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/send-otp", baseUrl);
      const res = await expoFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to resend code");
      }
      setOtpDigits(["", "", "", "", "", ""]);
      startResendTimer();
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").split("").slice(0, 6);
      const newOtp = [...otpDigits];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtpDigits(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otpDigits];
    newOtp[index] = value.replace(/\D/g, "");
    setOtpDigits(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyPress(index: number, key: string) {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otpDigits];
      newOtp[index - 1] = "";
      setOtpDigits(newOtp);
    }
  }

  async function handleVerifyOTP() {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/verify-otp", baseUrl);
      const res = await expoFetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Verification failed");
      }
      setStep("password");
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        referralCode: referralCode.trim() || undefined,
      });
      router.replace("/(main)/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  function renderStepIndicator() {
    const steps = [
      { key: "info", label: "Details" },
      { key: "otp", label: "Verify" },
      { key: "password", label: "Secure" },
    ];
    const currentIndex = steps.findIndex(s => s.key === step);
    return (
      <View style={styles.stepRow}>
        {steps.map((s, i) => (
          <View key={s.key} style={styles.stepItem}>
            <View style={[
              styles.stepDot,
              i <= currentIndex && styles.stepDotActive,
            ]}>
              {i < currentIndex ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[styles.stepDotText, i <= currentIndex && styles.stepDotTextActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, i <= currentIndex && styles.stepLabelActive]}>
              {s.label}
            </Text>
            {i < steps.length - 1 && (
              <View style={[styles.stepLine, i < currentIndex && styles.stepLineActive]} />
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0A1A14", "#0A0A0A", "#0A0A0A"]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          flexGrow: 1,
        }}
        bottomOffset={20}
      >
        <Pressable onPress={() => {
          if (step === "otp") { setStep("info"); setError(""); }
          else if (step === "password") { setStep("otp"); setError(""); }
          else router.back();
        }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>
            {step === "info" ? "Create Account" : step === "otp" ? "Verify Email" : "Set Password"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "info"
              ? "Enter your details to get started"
              : step === "otp"
              ? `Enter the 6-digit code sent to ${email}`
              : "Create a strong password for your account"}
          </Text>
        </View>

        {renderStepIndicator()}

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.dark.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {step === "info" && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color={Colors.dark.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="John Doe"
                    placeholderTextColor={Colors.dark.inputPlaceholder}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.dark.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={Colors.dark.inputPlaceholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={styles.hint}>
                  Temporary/disposable emails are blocked
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Referral Code (Optional)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="gift-outline" size={18} color={Colors.dark.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={referralCode}
                    onChangeText={setReferralCode}
                    placeholder="Enter referral code"
                    placeholderTextColor={Colors.dark.inputPlaceholder}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
                onPress={handleSendOTP}
                disabled={loading}
              >
                <LinearGradient
                  colors={[Colors.dark.emerald, Colors.dark.emeraldDark]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.buttonRow}>
                      <Text style={styles.buttonText}>Send Verification Code</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </View>
                  )}
                </LinearGradient>
              </Pressable>
            </>
          )}

          {step === "otp" && (
            <>
              <View style={styles.otpContainer}>
                {otpDigits.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={ref => { otpRefs.current[i] = ref; }}
                    style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                    value={digit}
                    onChangeText={v => handleOtpChange(i, v)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(i, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>

              <View style={styles.resendRow}>
                <Text style={styles.resendText}>
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Didn't get the code?"}
                </Text>
                {resendTimer === 0 && (
                  <Pressable onPress={handleResendOTP} disabled={loading}>
                    <Text style={styles.resendLink}>Resend</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
                onPress={handleVerifyOTP}
                disabled={loading}
              >
                <LinearGradient
                  colors={[Colors.dark.emerald, Colors.dark.emeraldDark]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Verify Email</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </>
          )}

          {step === "password" && (
            <>
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.dark.emerald} />
                <Text style={styles.verifiedText}>Email verified: {email}</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password (8+ characters)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.dark.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Create a strong password"
                    placeholderTextColor={Colors.dark.inputPlaceholder}
                    secureTextEntry={!showPassword}
                    autoFocus
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.dark.textMuted} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
                onPress={handleRegister}
                disabled={loading}
              >
                <LinearGradient
                  colors={[Colors.dark.emerald, Colors.dark.emeraldDark]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Create Account</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.footerLink}>Sign In</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  backButton: { marginBottom: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary, lineHeight: 20 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 24, gap: 0 },
  stepItem: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.dark.surfaceLight,
    alignItems: "center", justifyContent: "center",
  },
  stepDotActive: { backgroundColor: Colors.dark.emerald },
  stepDotText: { fontSize: 11, fontFamily: "DMSans_700Bold", color: Colors.dark.textMuted },
  stepDotTextActive: { color: "#fff" },
  stepLabel: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.textMuted, marginLeft: 6 },
  stepLabelActive: { color: Colors.dark.emerald },
  stepLine: {
    flex: 1, height: 1, backgroundColor: Colors.dark.surfaceBorder, marginHorizontal: 8,
  },
  stepLineActive: { backgroundColor: Colors.dark.emerald },
  form: { gap: 18 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.red + "15", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.red + "30",
  },
  errorText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.red, flex: 1 },
  inputGroup: { gap: 8 },
  label: { fontSize: 13, fontFamily: "DMSans_600SemiBold", color: Colors.dark.textSecondary },
  hint: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted },
  inputWrapper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.inputBorder,
  },
  inputIcon: { marginLeft: 14 },
  input: {
    flex: 1, padding: 14, fontSize: 15, fontFamily: "DMSans_400Regular",
    color: Colors.dark.inputText,
  },
  eyeButton: { padding: 14 },
  button: { marginTop: 8, borderRadius: 12, overflow: "hidden" },
  buttonGradient: { padding: 16, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 16, fontFamily: "DMSans_700Bold", color: "#fff" },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  otpContainer: {
    flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 8,
  },
  otpInput: {
    width: 46, height: 54, borderRadius: 12,
    backgroundColor: Colors.dark.inputBackground,
    borderWidth: 1, borderColor: Colors.dark.inputBorder,
    textAlign: "center" as const, fontSize: 22, fontFamily: "DMSans_700Bold",
    color: Colors.dark.text,
  },
  otpInputFilled: {
    borderColor: Colors.dark.emerald,
    backgroundColor: Colors.dark.emerald + "10",
  },
  resendRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 4 },
  resendText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
  resendLink: { fontSize: 13, fontFamily: "DMSans_600SemiBold", color: Colors.dark.emerald },
  verifiedBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.emerald + "15", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.emerald + "30",
  },
  verifiedText: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.emerald },
  footer: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 6, marginTop: 32,
  },
  footerText: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
  footerLink: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: Colors.dark.emerald },
});
