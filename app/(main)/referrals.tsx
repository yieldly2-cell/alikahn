import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, RefreshControl, Share, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetchWithTimeout } from "@/lib/fetch-helper";
import Colors from "@/constants/colors";

interface ReferralUser {
  id: string;
  fullName: string;
  createdAt: string;
  totalDeposited: number;
  isQualified: boolean;
}

interface ReferralData {
  referralCode: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  currentYield: number;
  maxYield: number;
  referralBonusPaid: boolean;
  isReferred: boolean;
  hasQualifiedDeposit: boolean;
  welcomeBonusPaid: boolean;
  referrals: ReferralUser[];
}

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [data, setData] = useState<ReferralData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const fetchReferrals = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/referrals", baseUrl);
      const res = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }, 1);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load referral data. Please refresh.");
      }
    } catch (err) {
      console.error("Referral fetch error:", err);
      setError("Failed to load referral data. Please refresh.");
    } finally {
      setLoading(false);
    }
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
        message: `Join Yieldly and earn up to 30% profit every 72 hours! Use my referral code: ${data.referralCode}`,
      });
    } catch {}
  }

  const referralCode = data?.referralCode || user?.referralCode || "";
  const currentYield = data?.currentYield || user?.totalYieldPercent || 10;
  const qualifiedCount = data?.qualifiedReferrals || user?.qualifiedReferrals || 0;
  const totalCount = data?.totalReferrals || user?.referralCount || 0;

  if (loading && !data) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.dark.emerald} />
        <Text style={{ color: Colors.dark.textSecondary, marginTop: 12, fontFamily: "DMSans_400Regular" }}>
          Loading referral data...
        </Text>
      </View>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.emerald} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Referral Program</Text>
        <Text style={styles.pageSubtitle}>Invite friends, earn +1% yield per qualified referral</Text>

        {error && (
          <Pressable style={styles.errorCard} onPress={() => { setLoading(true); fetchReferrals(); }}>
            <Ionicons name="alert-circle" size={18} color={Colors.dark.red} />
            <Text style={styles.errorText}>{error}</Text>
            <Ionicons name="refresh" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        )}

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your Referral Code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{referralCode || "---"}</Text>
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

        <View style={styles.yieldCard}>
          <View style={styles.yieldHeader}>
            <Text style={styles.yieldLabel}>Your Current Yield</Text>
            <Text style={styles.yieldValue}>{currentYield}%</Text>
          </View>
          <View style={styles.yieldProgressBg}>
            <View style={[styles.yieldProgressFill, { width: `${Math.max(5, ((currentYield - 10) / 20) * 100)}%` as any }]} />
          </View>
          <View style={styles.yieldRange}>
            <Text style={styles.yieldRangeText}>10% base</Text>
            <Text style={styles.yieldRangeText}>30% max</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={22} color={Colors.dark.emerald} />
            <Text style={styles.statValue}>{totalCount}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.dark.gold} />
            <Text style={styles.statValue}>{qualifiedCount}</Text>
            <Text style={styles.statLabel}>Qualified</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={22} color={Colors.dark.emeraldLight} />
            <Text style={styles.statValue}>+{qualifiedCount}%</Text>
            <Text style={styles.statLabel}>Bonus</Text>
          </View>
        </View>

        {data?.referralBonusPaid && (
          <View style={styles.milestoneCard}>
            <Ionicons name="trophy" size={20} color={Colors.dark.gold} />
            <Text style={styles.milestoneText}>$30 milestone bonus earned for 20+ qualified referrals!</Text>
          </View>
        )}

        {qualifiedCount >= 20 && !data?.referralBonusPaid && (
          <View style={[styles.milestoneCard, { borderColor: Colors.dark.emerald + "40" }]}>
            <Ionicons name="gift" size={20} color={Colors.dark.emerald} />
            <Text style={[styles.milestoneText, { color: Colors.dark.emerald }]}>
              You have {qualifiedCount} qualified referrals! $30 bonus is being processed.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>How It Works</Text>
        <View style={styles.rulesCard}>
          <View style={styles.ruleRow}>
            <View style={styles.ruleDot}><Text style={styles.ruleDotText}>1</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>Share your code</Text>
              <Text style={styles.ruleDesc}>Friends sign up with your referral code</Text>
            </View>
          </View>
          <View style={styles.ruleRow}>
            <View style={styles.ruleDot}><Text style={styles.ruleDotText}>2</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>They deposit $50+</Text>
              <Text style={styles.ruleDesc}>Referral qualifies when they deposit $50 or more</Text>
            </View>
          </View>
          <View style={styles.ruleRow}>
            <View style={styles.ruleDot}><Text style={styles.ruleDotText}>3</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>You earn +1% yield</Text>
              <Text style={styles.ruleDesc}>Each qualified referral adds +1% (max 30% total)</Text>
            </View>
          </View>
          <View style={[styles.ruleRow, { borderBottomWidth: 0 }]}>
            <View style={styles.ruleDot}><Text style={styles.ruleDotText}>4</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>Milestone bonus</Text>
              <Text style={styles.ruleDesc}>Reach 20 qualified referrals and get a $30 bonus</Text>
            </View>
          </View>
        </View>

        {data?.isReferred && (
          <>
            <Text style={styles.sectionTitle}>Your Referral Benefits</Text>
            <View style={styles.benefitCard}>
              {data.hasQualifiedDeposit ? (
                <>
                  <View style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={18} color={Colors.dark.emerald} />
                    <Text style={styles.benefitText}>11% base yield (referred user bonus)</Text>
                  </View>
                  {data.welcomeBonusPaid && (
                    <View style={styles.benefitRow}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.dark.emerald} />
                      <Text style={styles.benefitText}>$5 welcome bonus received</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.benefitRow}>
                  <Ionicons name="alert-circle" size={18} color={Colors.dark.gold} />
                  <Text style={[styles.benefitText, { color: Colors.dark.gold }]}>
                    Deposit $50+ to unlock 11% yield and $5 welcome bonus
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {totalCount > 0 && (
          <>
            <Text style={styles.sectionTitle}>Your Referrals ({qualifiedCount}/{totalCount} qualified)</Text>
            {data!.referrals.map(ref => (
              <View key={ref.id} style={styles.referralItem}>
                <View style={[styles.referralAvatar, ref.isQualified && styles.referralAvatarQualified]}>
                  <Ionicons
                    name={ref.isQualified ? "checkmark" : "person"}
                    size={16}
                    color={ref.isQualified ? Colors.dark.emerald : Colors.dark.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.referralName}>{ref.fullName}</Text>
                  <Text style={styles.referralDate}>
                    Joined {new Date(ref.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {ref.isQualified ? (
                    <View style={styles.qualifiedBadge}>
                      <Text style={styles.qualifiedBadgeText}>Qualified</Text>
                    </View>
                  ) : (
                    <Text style={styles.depositNeeded}>
                      ${ref.totalDeposited.toFixed(0)}/$50
                    </Text>
                  )}
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
  errorCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.dark.red + "15", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.red + "30", marginBottom: 16,
  },
  errorText: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.red, flex: 1 },
  codeCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.emerald + "30", marginBottom: 16,
  },
  codeLabel: { fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.dark.textMuted, marginBottom: 10 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeText: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.dark.emerald, letterSpacing: 3 },
  codeBtns: { flexDirection: "row", gap: 4 },
  codeBtn: { padding: 8 },
  copiedText: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.emerald, marginTop: 8 },
  yieldCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark.emerald + "30", marginBottom: 16,
  },
  yieldHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
  },
  yieldLabel: { fontSize: 14, fontFamily: "DMSans_500Medium", color: Colors.dark.textSecondary },
  yieldValue: { fontSize: 28, fontFamily: "DMSans_700Bold", color: Colors.dark.emerald },
  yieldProgressBg: {
    height: 8, backgroundColor: Colors.dark.surfaceBorder, borderRadius: 4, overflow: "hidden", marginBottom: 8,
  },
  yieldProgressFill: {
    height: "100%", backgroundColor: Colors.dark.emerald, borderRadius: 4,
  },
  yieldRange: { flexDirection: "row", justifyContent: "space-between" },
  yieldRangeText: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: Colors.dark.surface,
    borderRadius: 14, padding: 14, alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  statValue: { fontSize: 18, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  statLabel: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.textSecondary },
  milestoneCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.dark.gold + "10", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.gold + "30", marginBottom: 16,
  },
  milestoneText: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.gold, flex: 1 },
  sectionTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 12, marginTop: 8 },
  rulesCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 16, overflow: "hidden",
  },
  ruleRow: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.surfaceBorder,
  },
  ruleDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.dark.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  ruleDotText: { fontSize: 13, fontFamily: "DMSans_700Bold", color: Colors.dark.emerald },
  ruleTitle: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: Colors.dark.text },
  ruleDesc: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  benefitCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 16, gap: 10,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.text, flex: 1 },
  referralItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.dark.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder, marginBottom: 8,
  },
  referralAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.dark.surfaceBorder,
    alignItems: "center", justifyContent: "center",
  },
  referralAvatarQualified: { backgroundColor: Colors.dark.emerald + "20" },
  referralName: { fontSize: 14, fontFamily: "DMSans_600SemiBold", color: Colors.dark.text },
  referralDate: { fontSize: 11, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  qualifiedBadge: {
    backgroundColor: Colors.dark.emerald + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  qualifiedBadgeText: { fontSize: 11, fontFamily: "DMSans_600SemiBold", color: Colors.dark.emerald },
  depositNeeded: { fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.dark.textMuted },
});
