import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Platform, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import SvgQRCode from "react-native-qrcode-svg";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";

const PLATFORM_WALLET = "TLfixnZVqzmTp2UhQwHjPiiV9eK3NemLy7";

interface DepositData {
  id: string;
  amount: string;
  txid: string;
  status: string;
  createdAt: string;
}

export default function DepositScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deposits, setDeposits] = useState<DepositData[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const fetchDeposits = useCallback(async () => {
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/deposits", baseUrl);
      const res = await expoFetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeposits(await res.json());
      }
    } catch {}
  }, [token]);

  React.useEffect(() => { fetchDeposits(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDeposits();
    setRefreshing(false);
  }, [fetchDeposits]);

  async function copyWallet() {
    await Clipboard.setStringAsync(PLATFORM_WALLET);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitDeposit() {
    if (!amount || parseFloat(amount) < 5) {
      setError("Minimum deposit is $5");
      return;
    }
    if (!txid.trim()) {
      setError("Please enter your Transaction ID (TXID)");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/deposits", baseUrl);
      const res = await expoFetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: parseFloat(amount), txid: txid.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Deposit failed");
      }
      setSuccess("Deposit submitted! Pending admin approval.");
      setAmount("");
      setTxid("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchDeposits();
    } catch (err: any) {
      setError(err.message || "Failed to submit deposit");
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    if (status === "approved") return Colors.dark.emerald;
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
        <Text style={styles.pageTitle}>Deposit USDT</Text>
        <Text style={styles.pageSubtitle}>Send USDT (TRC-20) to the wallet below</Text>

        <View style={styles.walletCard}>
          <View style={styles.warningBadge}>
            <Ionicons name="warning" size={14} color={Colors.dark.gold} />
            <Text style={styles.warningText}>Only send USDT TRC-20</Text>
          </View>

          <View style={styles.qrContainer}>
            <View style={styles.qrWrapper}>
              <SvgQRCode
                value={PLATFORM_WALLET}
                size={160}
                backgroundColor="#fff"
                color="#000"
              />
            </View>
          </View>

          <Text style={styles.walletLabel}>Wallet Address</Text>
          <View style={styles.walletRow}>
            <Text style={styles.walletAddress} numberOfLines={1}>{PLATFORM_WALLET}</Text>
            <Pressable onPress={copyWallet} style={styles.copyBtn}>
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={copied ? Colors.dark.emerald : Colors.dark.textSecondary} />
            </Pressable>
          </View>
          {copied && <Text style={styles.copiedText}>Copied to clipboard</Text>}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Submit Deposit</Text>

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
              placeholder="Min $5.00"
              placeholderTextColor={Colors.dark.inputPlaceholder}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Transaction ID (TXID)</Text>
            <TextInput
              style={styles.input}
              value={txid}
              onChangeText={setTxid}
              placeholder="Paste your TXID"
              placeholderTextColor={Colors.dark.inputPlaceholder}
              autoCapitalize="none"
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
            onPress={submitDeposit}
            disabled={loading}
          >
            <LinearGradient
              colors={[Colors.dark.emerald, Colors.dark.emeraldDark]}
              style={styles.submitBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.submitBtnText}>Submit Deposit</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {deposits.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Deposit History</Text>
            {deposits.map(d => (
              <View key={d.id} style={styles.historyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyAmount}>${parseFloat(d.amount).toFixed(2)}</Text>
                  <Text style={styles.historyDate}>{new Date(d.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(d.status) + "20" }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(d.status) }]}>
                    {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
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
  walletCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 20,
    alignItems: "center",
  },
  warningBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.dark.gold + "15", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 16,
  },
  warningText: { fontSize: 12, fontFamily: "DMSans_600SemiBold", color: Colors.dark.gold },
  qrContainer: { marginBottom: 16 },
  qrWrapper: { padding: 12, backgroundColor: "#fff", borderRadius: 12 },
  walletLabel: { fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.dark.textMuted, marginBottom: 8 },
  walletRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dark.surfaceLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, width: "100%",
  },
  walletAddress: { flex: 1, fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.text },
  copyBtn: { padding: 4 },
  copiedText: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.emerald, marginTop: 6 },
  formCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24,
  },
  formTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 16 },
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
  submitBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  submitBtnGradient: { padding: 14, alignItems: "center" },
  submitBtnText: { fontSize: 15, fontFamily: "DMSans_700Bold", color: "#fff" },
  sectionTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 12 },
  historyItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 8,
  },
  historyAmount: { fontSize: 16, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  historyDate: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontFamily: "DMSans_600SemiBold" },
});
