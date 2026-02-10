import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Platform, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";

interface WithdrawalData {
  id: string;
  amount: string;
  usdtAddress: string;
  status: string;
  createdAt: string;
}

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalData[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const balance = parseFloat(user?.balance || "0");

  const fetchWithdrawals = useCallback(async () => {
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/withdrawals", baseUrl);
      const res = await expoFetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setWithdrawals(await res.json());
    } catch {}
  }, [token]);

  React.useEffect(() => { fetchWithdrawals(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), fetchWithdrawals()]);
    setRefreshing(false);
  }, [refreshUser, fetchWithdrawals]);

  async function submitWithdrawal() {
    const amt = parseFloat(amount);
    if (!amount || amt < 20) {
      setError("Minimum withdrawal is $20");
      return;
    }
    if (amt > balance) {
      setError("Insufficient balance");
      return;
    }
    if (!address.trim() || address.trim().length < 10) {
      setError("Please enter a valid USDT TRC-20 address");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/withdrawals", baseUrl);
      const res = await expoFetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: amt, usdtAddress: address.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Withdrawal failed");
      }
      setSuccess("Withdrawal submitted! Pending admin processing.");
      setAmount("");
      setAddress("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshUser();
      fetchWithdrawals();
    } catch (err: any) {
      setError(err.message || "Failed to submit withdrawal");
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    if (status === "processed") return Colors.dark.emerald;
    if (status === "rejected") return Colors.dark.red;
    return Colors.dark.gold;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.emerald} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Withdraw USDT</Text>
        <Text style={styles.pageSubtitle}>Request withdrawal to your TRC-20 wallet</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>${balance.toFixed(2)}</Text>
        </View>

        <View style={styles.formCard}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color={Colors.dark.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.dark.emerald} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount (USDT)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Min $20.00"
              placeholderTextColor={Colors.dark.inputPlaceholder}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>USDT TRC-20 Address</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter your wallet address"
              placeholderTextColor={Colors.dark.inputPlaceholder}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>Withdrawals are manually processed by our team. Please allow up to 24h.</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
            onPress={submitWithdrawal}
            disabled={loading}
          >
            <LinearGradient
              colors={[Colors.dark.gold, Colors.dark.goldDark]}
              style={styles.submitBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loading ? <ActivityIndicator color="#000" /> : (
                <Text style={styles.submitBtnText}>Request Withdrawal</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {withdrawals.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Withdrawal History</Text>
            {withdrawals.map(w => (
              <View key={w.id} style={styles.historyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyAmount}>${parseFloat(w.amount).toFixed(2)}</Text>
                  <Text style={styles.historyAddress} numberOfLines={1}>{w.usdtAddress}</Text>
                  <Text style={styles.historyDate}>{new Date(w.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(w.status) + "20" }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(w.status) }]}>
                    {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  pageTitle: { fontSize: 24, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary, marginBottom: 20 },
  balanceCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 20,
  },
  balanceLabel: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.textSecondary, marginBottom: 4 },
  balanceAmount: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  formCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.red + "15", borderRadius: 8, padding: 10, marginBottom: 12,
  },
  errorText: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.red, flex: 1 },
  successBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.emerald + "15", borderRadius: 8, padding: 10, marginBottom: 12,
  },
  successText: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.emerald, flex: 1 },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontFamily: "DMSans_600SemiBold", color: Colors.dark.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.dark.inputBackground, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.dark.inputBorder,
    padding: 14, fontSize: 15, fontFamily: "DMSans_400Regular", color: Colors.dark.inputText,
  },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.dark.surfaceLight, borderRadius: 8, padding: 12, marginBottom: 16,
  },
  infoText: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, flex: 1 },
  submitBtn: { borderRadius: 12, overflow: "hidden" },
  submitBtnGradient: { padding: 14, alignItems: "center" },
  submitBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold", color: "#000" },
  sectionTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 12 },
  historyItem: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 8,
  },
  historyAmount: { fontSize: 16, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  historyAddress: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  historyDate: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "DMSans_600SemiBold" },
});
