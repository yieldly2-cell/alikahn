import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, RefreshControl, Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch as expoFetch } from "expo/fetch";
import Colors from "@/constants/colors";

interface ReferralData {
  referralCode: string;
  referralCount: number;
  currentTier: string;
  totalEarnings: string;
  referrals: { id: string; fullName: string; createdAt: string }[];
}

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<ReferralData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const fetchReferrals = useCallback(async () => {
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/referrals", baseUrl);
      const res = await expoFetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch {}
  }, [token]);

  useEffect(() => { fetchReferrals(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchReferrals();
    setRefreshing(false);
  }, [fetchReferrals]);

  async function copyCode() {
    if (!data) return;
    await Clipboard.setStringAsync(data.referralCode);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareCode() {
    if (!data) return;
    try {
      await Share.share({
        message: `Join Yieldly and earn 10% profit every 72 hours! Use my referral code: ${data.referralCode}`,
      });
    } catch {}
  }

  const tiers = [
    { refs: 0, rate: "10%", label: "Base Rate", active: (data?.referralCount || 0) === 0 },
    { refs: 1, rate: "11%", label: "1 Referral", active: (data?.referralCount || 0) === 1 },
    { refs: 2, rate: "12%", label: "2 Referrals", active: (data?.referralCount || 0) === 2 },
    { refs: 3, rate: "13%", label: "3+ Referrals", active: (data?.referralCount || 0) >= 3 },
  ];

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
        <Text style={styles.pageTitle}>Referral Program</Text>
        <Text style={styles.pageSubtitle}>Invite friends and earn higher yields</Text>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your Referral Code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{data?.referralCode || "---"}</Text>
            <View style={styles.codeBtns}>
              <Pressable onPress={copyCode} style={styles.codeBtn}>
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color={copied ? Colors.dark.emerald : Colors.dark.text} />
              </Pressable>
              <Pressable onPress={shareCode} style={styles.codeBtn}>
                <Ionicons name="share-outline" size={20} color={Colors.dark.text} />
              </Pressable>
            </View>
          </View>
          {copied && <Text style={styles.copiedText}>Copied!</Text>}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={22} color={Colors.dark.emerald} />
            <Text style={styles.statValue}>{data?.referralCount || 0}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={22} color={Colors.dark.gold} />
            <Text style={styles.statValue}>{data?.currentTier || "10%"}</Text>
            <Text style={styles.statLabel}>Your Rate</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="cash" size={22} color={Colors.dark.emeraldLight} />
            <Text style={styles.statValue}>${data?.totalEarnings || "0.00"}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Commission Tiers</Text>
        <View style={styles.tiersCard}>
          {tiers.map((tier, i) => (
            <View
              key={i}
              style={[styles.tierRow, tier.active && styles.tierActive, i < tiers.length - 1 && styles.tierBorder]}
            >
              <View style={styles.tierLeft}>
                <View style={[styles.tierDot, tier.active && styles.tierDotActive]} />
                <View>
                  <Text style={[styles.tierLabel, tier.active && styles.tierLabelActive]}>{tier.label}</Text>
                  <Text style={styles.tierDesc}>
                    {tier.refs === 0 ? "Default yield" : `Invite ${tier.refs} friend${tier.refs > 1 ? "s" : ""}`}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tierRate, tier.active && styles.tierRateActive]}>{tier.rate}</Text>
            </View>
          ))}
        </View>

        {(data?.referrals?.length || 0) > 0 && (
          <>
            <Text style={styles.sectionTitle}>Your Referrals</Text>
            {data!.referrals.map(ref => (
              <View key={ref.id} style={styles.referralItem}>
                <View style={styles.referralAvatar}>
                  <Ionicons name="person" size={16} color={Colors.dark.emerald} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.referralName}>{ref.fullName}</Text>
                  <Text style={styles.referralDate}>Joined {new Date(ref.createdAt).toLocaleDateString()}</Text>
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
  codeCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.emerald + "30", marginBottom: 20,
  },
  codeLabel: { fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.dark.textMuted, marginBottom: 10 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeText: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.dark.emerald, letterSpacing: 3 },
  codeBtns: { flexDirection: "row", gap: 4 },
  codeBtn: { padding: 8 },
  copiedText: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.emerald, marginTop: 8 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: Colors.dark.surface,
    borderRadius: 14, padding: 14, alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  statValue: { fontSize: 18, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  statLabel: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.textSecondary },
  sectionTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 12 },
  tiersCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 24, overflow: "hidden",
  },
  tierRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  tierActive: { backgroundColor: Colors.dark.emerald + "10" },
  tierBorder: { borderBottomWidth: 1, borderBottomColor: Colors.dark.surfaceBorder },
  tierLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  tierDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.dark.surfaceBorder },
  tierDotActive: { backgroundColor: Colors.dark.emerald },
  tierLabel: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: Colors.dark.textSecondary },
  tierLabelActive: { color: Colors.dark.text },
  tierDesc: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  tierRate: { fontSize: 18, fontFamily: "DMSans_700Bold", color: Colors.dark.textMuted },
  tierRateActive: { color: Colors.dark.emerald },
  referralItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 8,
  },
  referralAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.dark.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  referralName: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: Colors.dark.text },
  referralDate: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
});
