import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";

interface InvestmentData {
  id: string;
  amount: string;
  profitRate: string;
  startedAt: string;
  maturesAt: string;
  profitPaid: boolean;
  status: string;
}

interface AvailableDeposit {
  id: string;
  amount: string;
  txid: string;
  status: string;
  createdAt: string;
}

function InvestmentTimer({ investment }: { investment: InvestmentData }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function update() {
      const now = Date.now();
      const start = new Date(investment.startedAt).getTime();
      const end = new Date(investment.maturesAt).getTime();
      const total = end - start;
      const elapsed = now - start;
      const remaining = Math.max(0, end - now);

      setProgress(Math.min(1, elapsed / total));

      if (remaining <= 0) {
        setTimeLeft("Matured");
        return;
      }

      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [investment]);

  const amount = parseFloat(investment.amount);
  const profit = amount * (parseFloat(investment.profitRate) / 100);
  const isMatured = investment.status === "completed" || progress >= 1;

  return (
    <View style={timerStyles.card}>
      <View style={timerStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={timerStyles.amount}>${amount.toFixed(2)}</Text>
          <Text style={timerStyles.profitLabel}>
            +${profit.toFixed(2)} ({investment.profitRate}%)
          </Text>
        </View>
        <View style={[timerStyles.statusBadge, isMatured && timerStyles.statusMatured]}>
          <Text style={[timerStyles.statusText, isMatured && timerStyles.statusMaturedText]}>
            {isMatured ? "Completed" : "Active"}
          </Text>
        </View>
      </View>

      <View style={timerStyles.progressBarBg}>
        <LinearGradient
          colors={[Colors.dark.emerald, Colors.dark.emeraldLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[timerStyles.progressBar, { width: `${Math.min(100, progress * 100)}%` as any }]}
        />
      </View>

      <View style={timerStyles.timerRow}>
        <Ionicons name="time-outline" size={14} color={Colors.dark.textSecondary} />
        <Text style={timerStyles.timerText}>
          {isMatured ? "Investment matured" : timeLeft + " remaining"}
        </Text>
      </View>
    </View>
  );
}

const timerStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.surfaceBorder,
    marginBottom: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  amount: { fontSize: 22, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  profitLabel: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.emerald, marginTop: 2 },
  statusBadge: {
    backgroundColor: Colors.dark.gold + "20",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  statusMatured: { backgroundColor: Colors.dark.emerald + "20" },
  statusText: { fontSize: 12, fontFamily: "DMSans_600SemiBold", color: Colors.dark.gold },
  statusMaturedText: { color: Colors.dark.emerald },
  progressBarBg: {
    height: 6, backgroundColor: Colors.dark.surfaceBorder,
    borderRadius: 3, overflow: "hidden", marginBottom: 10,
  },
  progressBar: { height: "100%", borderRadius: 3 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timerText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
});

function AvailableDepositCard({
  deposit,
  onStart,
  starting,
  user,
}: {
  deposit: AvailableDeposit;
  onStart: (id: string) => void;
  starting: boolean;
  user?: any;
}) {
  const amount = parseFloat(deposit.amount);
  return (
    <View style={availStyles.card}>
      <View style={availStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={availStyles.amount}>${amount.toFixed(2)}</Text>
          <Text style={availStyles.date}>
            Approved {new Date(deposit.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onStart(deposit.id);
          }}
          disabled={starting}
          style={({ pressed }) => [availStyles.startBtn, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[Colors.dark.emerald, Colors.dark.emeraldDark]}
            style={availStyles.startBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {starting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={availStyles.startBtnText}>Start</Text>
              </View>
            )}
          </LinearGradient>
        </Pressable>
      </View>
      <View style={availStyles.infoRow}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.dark.gold} />
        <Text style={availStyles.infoText}>
          Starts 72h investment at your current {user?.totalYieldPercent || 10}% yield rate
        </Text>
      </View>
    </View>
  );
}

const availStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.dark.emerald + "30", marginBottom: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  amount: { fontSize: 20, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  date: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 2 },
  startBtn: { borderRadius: 10, overflow: "hidden" },
  startBtnGradient: { paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" },
  startBtnText: { fontSize: 14, fontFamily: "DMSans_700Bold", color: "#fff" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoText: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.gold },
});

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, refreshUser } = useAuth();
  const [investments, setInvestments] = useState<InvestmentData[]>([]);
  const [availableDeposits, setAvailableDeposits] = useState<AvailableDeposit[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const fetchInvestments = useCallback(async () => {
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/investments", baseUrl);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvestments(data);
      }
    } catch (err) {
      console.error("Failed to fetch investments:", err);
    }
  }, [token]);

  const fetchAvailableDeposits = useCallback(async () => {
    if (!token) return;
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/investments/available-deposits", baseUrl);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableDeposits(data);
      }
    } catch (err) {
      console.error("Failed to fetch available deposits:", err);
    }
  }, [token]);

  useEffect(() => {
    fetchInvestments();
    fetchAvailableDeposits();
    refreshUser();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), fetchInvestments(), fetchAvailableDeposits()]);
    setRefreshing(false);
  }, [refreshUser, fetchInvestments, fetchAvailableDeposits]);

  async function startInvestment(depositId: string) {
    setStartingId(depositId);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/investments/start", baseUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ depositId }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Start investment error:", data.message);
        return;
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([fetchInvestments(), fetchAvailableDeposits(), refreshUser()]);
    } catch (err) {
      console.error("Failed to start investment:", err);
    } finally {
      setStartingId(null);
    }
  }

  const balance = parseFloat(user?.balance || "0");
  const activeInvestments = investments.filter(i => i.status === "active");
  const totalInvested = activeInvestments.reduce((s, i) => s + parseFloat(i.amount), 0);
  const totalProfit = investments
    .filter(i => i.status === "completed")
    .reduce((s, i) => s + parseFloat(i.amount) * (parseFloat(i.profitRate) / 100), 0);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.emerald} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.fullName || "User"}</Text>
          </View>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color={Colors.dark.emerald} />
          </View>
        </View>

        <LinearGradient
          colors={["#0D3D2E", "#0A2A1F"]}
          style={styles.balanceCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>${balance.toFixed(2)}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceStat}>
              <Ionicons name="trending-up" size={14} color={Colors.dark.emeraldLight} />
              <Text style={styles.balanceStatText}>Invested: ${totalInvested.toFixed(2)}</Text>
            </View>
            <View style={styles.balanceStat}>
              <Ionicons name="cash-outline" size={14} color={Colors.dark.goldLight} />
              <Text style={styles.balanceStatText}>Earned: ${totalProfit.toFixed(2)}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="layers-outline" size={20} color={Colors.dark.emerald} />
            <Text style={styles.statValue}>{activeInvestments.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.statValue}>{user?.referralCount || 0}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.dark.emeraldLight} />
            <Text style={styles.statValue}>{user?.totalYieldPercent || 10}%</Text>
            <Text style={styles.statLabel}>Yield / 72h</Text>
          </View>
        </View>

        {availableDeposits.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Ready to Invest</Text>
            <Text style={styles.sectionSubtitle}>
              These approved deposits are ready. Tap Start to begin the 72-hour investment.
            </Text>
            {availableDeposits.map(dep => (
              <AvailableDepositCard
                key={dep.id}
                deposit={dep}
                onStart={startInvestment}
                starting={startingId === dep.id}
                user={user}
              />
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Active Investments</Text>

        {activeInvestments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={40} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>No active investments</Text>
            <Text style={styles.emptySubtext}>Make a deposit to start earning</Text>
          </View>
        ) : (
          activeInvestments.map(inv => (
            <InvestmentTimer key={inv.id} investment={inv} />
          ))
        )}

        {investments.filter(i => i.status === "completed").length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Completed</Text>
            {investments.filter(i => i.status === "completed").map(inv => (
              <InvestmentTimer key={inv.id} investment={inv} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  greetingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting: { fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
  userName: { fontSize: 22, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.dark.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  balanceCard: {
    borderRadius: 18, padding: 22, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.dark.emerald + "30",
  },
  balanceLabel: { fontSize: 13, fontFamily: "DMSans_500Medium", color: Colors.dark.textSecondary, marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 16 },
  balanceRow: { flexDirection: "row", gap: 20 },
  balanceStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceStatText: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: Colors.dark.surface,
    borderRadius: 14, padding: 14, alignItems: "center", gap: 6,
    borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  statValue: { fontSize: 20, fontFamily: "DMSans_700Bold", color: Colors.dark.text },
  statLabel: { fontSize: 11, fontFamily: "DMSans_500Medium", color: Colors.dark.textSecondary },
  sectionTitle: { fontSize: 17, fontFamily: "DMSans_700Bold", color: Colors.dark.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, fontFamily: "DMSans_400Regular", color: Colors.dark.textSecondary, marginBottom: 12 },
  emptyState: {
    alignItems: "center", paddingVertical: 40,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.dark.surfaceBorder,
  },
  emptyText: { fontSize: 15, fontFamily: "DMSans_600SemiBold", color: Colors.dark.textSecondary, marginTop: 12 },
  emptySubtext: { fontSize: 13, fontFamily: "DMSans_400Regular", color: Colors.dark.textMuted, marginTop: 4 },
});
