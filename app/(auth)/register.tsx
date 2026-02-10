import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  async function handleRegister() {
    if (!fullName || !email || !password) {
      setError("Please fill in all required fields");
      return;
    }
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
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join Yieldly and start earning</Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.dark.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
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
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
  form: { gap: 18 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.red + "15", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.dark.red + "30",
  },
  errorText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.red, flex: 1 },
  inputGroup: { gap: 8 },
  label: { fontSize: 13, fontFamily: "DMSans_600SemiBold", color: Colors.dark.textSecondary },
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
  footer: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 6, marginTop: 32,
  },
  footerText: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
  footerLink: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: Colors.dark.emerald },
});
