import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  async function handleLogout() {
    if (Platform.OS === "web") {
      await logout();
      router.replace("/(auth)/login");
      return;
    }

    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  function SettingsItem({
    icon,
    label,
    value,
    onPress,
    danger,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress?: () => void;
    danger?: boolean;
  }) {
    return (
      <Pressable
        style={({ pressed }) => [styles.settingsItem, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        disabled={!onPress}
      >
        <View style={styles.settingsLeft}>
          <View style={[styles.iconWrapper, danger && { backgroundColor: Colors.dark.red + "15" }]}>
            <Ionicons name={icon} size={18} color={danger ? Colors.dark.red : Colors.dark.emerald} />
          </View>
          <Text style={[styles.settingsLabel, danger && { color: Colors.dark.red }]}>{label}</Text>
        </View>
        {value ? (
          <Text style={styles.settingsValue}>{value}</Text>
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Settings</Text>

        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={28} color={Colors.dark.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.fullName || "User"}</Text>
            <Text style={styles.profileEmail}>{user?.email || ""}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsCard}>
          <SettingsItem icon="person-outline" label="Full Name" value={user?.fullName} />
          <SettingsItem icon="mail-outline" label="Email" value={user?.email} />
          <SettingsItem icon="code-outline" label="Referral Code" value={user?.referralCode} />
        </View>

        <Text style={styles.sectionTitle}>Legal</Text>
        <View style={styles.settingsCard}>
          <SettingsItem
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL("https://yieldly.app/terms")}
          />
          <SettingsItem
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL("https://yieldly.app/privacy")}
          />
        </View>

        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.settingsCard}>
          <SettingsItem icon="information-circle-outline" label="Version" value="1.0.0" />
          <SettingsItem
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            danger
          />
        </View>

        <Text style={styles.footerText}>Yieldly - Secure USDT Investment Platform</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  pageTitle: { fontSize: 24, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 20 },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24,
  },
  profileAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.dark.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  profileName: { fontSize: 18, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  profileEmail: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontFamily: "DMSans_600SemiBold", color: Colors.dark.textMuted, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: 1 },
  settingsCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24, overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.dark.surfaceBorder,
  },
  settingsLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrapper: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.dark.emerald + "15",
    alignItems: "center", justifyContent: "center",
  },
  settingsLabel: { fontSize: 14, fontFamily: "DMSans_500Medium", color: Colors.dark.text },
  settingsValue: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary, maxWidth: 180 },
  footerText: {
    fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted,
    textAlign: "center", marginTop: 8,
  },
});
