import { eq, desc, and, sql, lte, gt, gte, sum } from "drizzle-orm";
import { db } from "./db";
import {
  users, deposits, investments, withdrawals, referralCommissions, auditLogs, otpCodes,
  type User, type Deposit, type Investment, type Withdrawal, type ReferralCommission, type AuditLog, type OtpCode,
} from "../shared/schema";

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createUser(data: {
  fullName: string;
  email: string;
  password: string;
  referredBy?: string;
  deviceId?: string;
}): Promise<User> {
  let referralCode = generateReferralCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.select().from(users).where(eq(users.referralCode, referralCode));
    if (existing.length === 0) break;
    referralCode = generateReferralCode();
    attempts++;
  }

  const [user] = await db.insert(users).values({
    fullName: data.fullName,
    email: data.email.toLowerCase(),
    password: data.password,
    referralCode,
    referredBy: data.referredBy || null,
    deviceId: data.deviceId || null,
    emailVerified: true,
  }).returning();
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByReferralCode(code: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.referralCode, code.toUpperCase()));
  return user;
}

export async function getUserByDeviceId(deviceId: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.deviceId, deviceId));
  return user;
}

export async function getReferralCount(userId: string): Promise<number> {
  const result = await db.select().from(users).where(eq(users.referredBy, userId));
  return result.length;
}

export async function updateUserBalance(userId: string, amount: string): Promise<void> {
  await db.update(users).set({
    balance: sql`${users.balance}::numeric + ${amount}::numeric`,
  }).where(eq(users.id, userId));
}

export async function setUserBalance(userId: string, balance: string): Promise<void> {
  await db.update(users).set({ balance }).where(eq(users.id, userId));
}

export async function blockUser(userId: string, blocked: boolean): Promise<void> {
  await db.update(users).set({ isBlocked: blocked }).where(eq(users.id, userId));
}

export async function getAllUsers(): Promise<User[]> {
  return db.select().from(users).orderBy(desc(users.createdAt));
}

// OTP functions
export async function createOTP(email: string, code: string): Promise<OtpCode> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const [otp] = await db.insert(otpCodes).values({
    email: email.toLowerCase(),
    code,
    expiresAt,
  }).returning();
  return otp;
}

export async function getLatestOTP(email: string): Promise<OtpCode | undefined> {
  const [otp] = await db.select().from(otpCodes)
    .where(and(
      eq(otpCodes.email, email.toLowerCase()),
      eq(otpCodes.verified, false),
      gt(otpCodes.expiresAt, new Date()),
    ))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  return otp;
}

export async function incrementOTPAttempts(otpId: string): Promise<void> {
  await db.update(otpCodes).set({
    attempts: sql`${otpCodes.attempts} + 1`,
  }).where(eq(otpCodes.id, otpId));
}

export async function markOTPVerified(otpId: string): Promise<void> {
  await db.update(otpCodes).set({ verified: true }).where(eq(otpCodes.id, otpId));
}

// Deposit functions
export async function createDeposit(data: {
  userId: string;
  amount: string;
  txid: string;
  screenshotUrl?: string;
}): Promise<Deposit> {
  const [deposit] = await db.insert(deposits).values({
    userId: data.userId,
    amount: data.amount,
    txid: data.txid,
    screenshotUrl: data.screenshotUrl || null,
  }).returning();
  return deposit;
}

export async function getDepositsByUser(userId: string): Promise<Deposit[]> {
  return db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt));
}

export async function getDepositById(depositId: string): Promise<Deposit | undefined> {
  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, depositId));
  return deposit;
}

export async function getAllDeposits(): Promise<(Deposit & { userName?: string; userEmail?: string })[]> {
  const result = await db
    .select({
      id: deposits.id,
      userId: deposits.userId,
      amount: deposits.amount,
      txid: deposits.txid,
      screenshotUrl: deposits.screenshotUrl,
      status: deposits.status,
      createdAt: deposits.createdAt,
      reviewedAt: deposits.reviewedAt,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(deposits)
    .leftJoin(users, eq(deposits.userId, users.id))
    .orderBy(desc(deposits.createdAt));
  return result;
}

export async function updateDepositStatus(depositId: string, status: string): Promise<Deposit | undefined> {
  const [deposit] = await db.update(deposits).set({
    status,
    reviewedAt: new Date(),
  }).where(eq(deposits.id, depositId)).returning();
  return deposit;
}

export async function getApprovedDepositsWithoutInvestment(userId: string): Promise<Deposit[]> {
  const userInvestments = await db.select({ depositId: investments.depositId }).from(investments).where(eq(investments.userId, userId));
  const investedDepositIds = userInvestments.map(i => i.depositId);

  const approvedDeposits = await db.select().from(deposits).where(
    and(
      eq(deposits.userId, userId),
      eq(deposits.status, "approved"),
    )
  ).orderBy(desc(deposits.createdAt));

  return approvedDeposits.filter(d => !investedDepositIds.includes(d.id));
}

// Investment functions
export async function createInvestment(data: {
  userId: string;
  depositId: string;
  amount: string;
  profitRate: string;
}): Promise<Investment> {
  const maturesAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const [investment] = await db.insert(investments).values({
    userId: data.userId,
    depositId: data.depositId,
    amount: data.amount,
    profitRate: data.profitRate,
    maturesAt,
  }).returning();
  return investment;
}

export async function getInvestmentsByUser(userId: string): Promise<Investment[]> {
  return db.select().from(investments).where(eq(investments.userId, userId)).orderBy(desc(investments.startedAt));
}

export async function getAllInvestments(): Promise<Investment[]> {
  return db.select().from(investments).orderBy(desc(investments.startedAt));
}

export async function getMatureInvestments(): Promise<Investment[]> {
  return db.select().from(investments).where(
    and(
      eq(investments.status, "active"),
      eq(investments.profitPaid, false),
      lte(investments.maturesAt, new Date()),
    )
  );
}

export async function markInvestmentPaid(investmentId: string): Promise<void> {
  await db.update(investments).set({
    profitPaid: true,
    status: "completed",
  }).where(eq(investments.id, investmentId));
}

export async function hasInvestmentForDeposit(depositId: string): Promise<boolean> {
  const [existing] = await db.select().from(investments).where(eq(investments.depositId, depositId));
  return !!existing;
}

// Withdrawal functions
export async function createWithdrawal(data: {
  userId: string;
  amount: string;
  usdtAddress: string;
}): Promise<Withdrawal> {
  const [withdrawal] = await db.insert(withdrawals).values({
    userId: data.userId,
    amount: data.amount,
    usdtAddress: data.usdtAddress,
  }).returning();
  return withdrawal;
}

export async function getWithdrawalsByUser(userId: string): Promise<Withdrawal[]> {
  return db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt));
}

export async function getAllWithdrawals(): Promise<(Withdrawal & { userName?: string; userEmail?: string })[]> {
  const result = await db
    .select({
      id: withdrawals.id,
      userId: withdrawals.userId,
      amount: withdrawals.amount,
      usdtAddress: withdrawals.usdtAddress,
      status: withdrawals.status,
      createdAt: withdrawals.createdAt,
      reviewedAt: withdrawals.reviewedAt,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(withdrawals)
    .leftJoin(users, eq(withdrawals.userId, users.id))
    .orderBy(desc(withdrawals.createdAt));
  return result;
}

export async function updateWithdrawalStatus(withdrawalId: string, status: string): Promise<Withdrawal | undefined> {
  const [withdrawal] = await db.update(withdrawals).set({
    status,
    reviewedAt: new Date(),
  }).where(eq(withdrawals.id, withdrawalId)).returning();
  return withdrawal;
}

// Referral functions
export async function createReferralCommission(data: {
  referrerId: string;
  fromUserId: string;
  investmentId: string;
  amount: string;
}): Promise<ReferralCommission> {
  const [commission] = await db.insert(referralCommissions).values(data).returning();
  return commission;
}

export async function getCommissionsByUser(userId: string): Promise<ReferralCommission[]> {
  return db.select().from(referralCommissions).where(eq(referralCommissions.referrerId, userId)).orderBy(desc(referralCommissions.createdAt));
}

export async function getReferrals(userId: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.referredBy, userId));
}

export async function getReferralsWithDepositInfo(userId: string): Promise<(User & { totalDeposited: number; isQualified: boolean })[]> {
  const referredUsers = await db.select().from(users).where(eq(users.referredBy, userId));
  const result = [];
  for (const u of referredUsers) {
    const userDeposits = await db.select().from(deposits).where(
      and(eq(deposits.userId, u.id), eq(deposits.status, "approved"))
    );
    const totalDeposited = userDeposits.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    result.push({ ...u, totalDeposited, isQualified: totalDeposited >= 50 });
  }
  return result;
}

export async function incrementQualifiedReferrals(userId: string): Promise<User | undefined> {
  const [updated] = await db.update(users).set({
    qualifiedReferrals: sql`${users.qualifiedReferrals} + 1`,
    totalYieldPercent: sql`LEAST(30, ${users.totalYieldPercent} + 1)`,
  }).where(eq(users.id, userId)).returning();
  return updated;
}

export async function markWelcomeBonusPaid(userId: string): Promise<void> {
  await db.update(users).set({ welcomeBonusPaid: true }).where(eq(users.id, userId));
}

export async function markReferralBonusPaid(userId: string): Promise<void> {
  await db.update(users).set({ referralBonusPaid: true }).where(eq(users.id, userId));
}

export async function setUserYieldPercent(userId: string, yieldPercent: number): Promise<void> {
  await db.update(users).set({ totalYieldPercent: Math.min(30, yieldPercent) }).where(eq(users.id, userId));
}

export async function getTotalApprovedDeposits(userId: string): Promise<number> {
  const userDeposits = await db.select().from(deposits).where(
    and(eq(deposits.userId, userId), eq(deposits.status, "approved"))
  );
  return userDeposits.reduce((sum, d) => sum + parseFloat(d.amount), 0);
}

export async function hasQualifiedReferralFor(referrerId: string, referredUserId: string): Promise<boolean> {
  const commissions = await db.select().from(referralCommissions).where(
    and(
      eq(referralCommissions.referrerId, referrerId),
      eq(referralCommissions.fromUserId, referredUserId),
    )
  );
  return commissions.length > 0;
}

// Audit functions
export async function createAuditLog(data: {
  action: string;
  details?: string;
  targetUserId?: string;
}): Promise<void> {
  await db.insert(auditLogs).values(data);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
}

// Admin dashboard functions
export async function getAllReferralCommissions(): Promise<(ReferralCommission & { referrerName?: string; referrerEmail?: string; fromUserName?: string; fromUserEmail?: string })[]> {
  const allCommissions = await db.select().from(referralCommissions).orderBy(desc(referralCommissions.createdAt));
  
  const result = await Promise.all(allCommissions.map(async (commission) => {
    const referrer = await getUserById(commission.referrerId);
    const fromUser = await getUserById(commission.fromUserId);
    
    return {
      ...commission,
      referrerName: referrer?.fullName,
      referrerEmail: referrer?.email,
      fromUserName: fromUser?.fullName,
      fromUserEmail: fromUser?.email,
    };
  }));
  
  return result;
}

export async function getUserDetail(userId: string): Promise<{
  user: User;
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  investments: Investment[];
  referrals: User[];
  referredBy: User | undefined;
} | undefined> {
  const user = await getUserById(userId);
  if (!user) return undefined;

  const [deposits, withdrawals, investments, referrals] = await Promise.all([
    getDepositsByUser(userId),
    getWithdrawalsByUser(userId),
    getInvestmentsByUser(userId),
    getReferrals(userId),
  ]);

  const referredBy = user.referredBy ? await getUserById(user.referredBy) : undefined;

  return {
    user,
    deposits,
    withdrawals,
    investments,
    referrals,
    referredBy,
  };
}

export async function getInvestmentsWithUserInfo(): Promise<(Investment & { userName?: string; userEmail?: string })[]> {
  const result = await db
    .select({
      id: investments.id,
      userId: investments.userId,
      depositId: investments.depositId,
      amount: investments.amount,
      profitRate: investments.profitRate,
      startedAt: investments.startedAt,
      maturesAt: investments.maturesAt,
      profitPaid: investments.profitPaid,
      status: investments.status,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(investments)
    .leftJoin(users, eq(investments.userId, users.id))
    .orderBy(desc(investments.startedAt));
  return result;
}

export async function getAuditLogsWithPagination(limit: number, offset: number): Promise<{ logs: AuditLog[]; total: number }> {
  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(auditLogs);

  const total = countResult[0]?.count || 0;

  return { logs, total };
}

export async function getTodayProfit(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await db
    .select({
      total: sum(investments.amount),
    })
    .from(investments)
    .where(
      and(
        eq(investments.status, "completed"),
        eq(investments.profitPaid, true),
        gte(investments.maturesAt, today),
        lte(investments.maturesAt, tomorrow),
      )
    );

  const total = result[0]?.total;
  return total ? parseFloat(total as any) : 0;
}

export async function getTotalReferralEarnings(): Promise<number> {
  const result = await db
    .select({
      total: sum(referralCommissions.amount),
    })
    .from(referralCommissions);

  const total = result[0]?.total;
  return total ? parseFloat(total as any) : 0;
}
