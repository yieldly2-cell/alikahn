import { eq, desc, and, sql, lte } from "drizzle-orm";
import { db } from "./db";
import {
  users, deposits, investments, withdrawals, referralCommissions, auditLogs,
  type User, type Deposit, type Investment, type Withdrawal, type ReferralCommission, type AuditLog,
} from "../shared/schema";

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "YLD";
  for (let i = 0; i < 5; i++) {
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
