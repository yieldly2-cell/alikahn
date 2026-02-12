var __defProp = Object.defineProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import multer from "multer";
import path from "path";
import fs from "fs";

// server/storage.ts
import { eq, desc, and, sql as sql2, lte, gt, gte, sum } from "drizzle-orm";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  auditLogs: () => auditLogs,
  depositSchema: () => depositSchema,
  deposits: () => deposits,
  insertUserSchema: () => insertUserSchema,
  investments: () => investments,
  loginSchema: () => loginSchema,
  otpCodes: () => otpCodes,
  referralCommissions: () => referralCommissions,
  registerSchema: () => registerSchema,
  users: () => users,
  withdrawalSchema: () => withdrawalSchema,
  withdrawals: () => withdrawals
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  balance: numeric("balance", { precision: 20, scale: 6 }).notNull().default("0"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  deviceId: text("device_id"),
  qualifiedReferrals: integer("qualified_referrals").notNull().default(0),
  totalYieldPercent: integer("total_yield_percent").notNull().default(10),
  referralBonusPaid: boolean("referral_bonus_paid").notNull().default(false),
  welcomeBonusPaid: boolean("welcome_bonus_paid").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var otpCodes = pgTable("otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  code: text("code").notNull(),
  attempts: integer("attempts").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var deposits = pgTable("deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  txid: text("txid").notNull(),
  screenshotUrl: text("screenshot_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at")
});
var investments = pgTable("investments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  depositId: varchar("deposit_id").notNull().references(() => deposits.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  profitRate: numeric("profit_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  maturesAt: timestamp("matures_at").notNull(),
  profitPaid: boolean("profit_paid").notNull().default(false),
  status: text("status").notNull().default("active")
});
var withdrawals = pgTable("withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  usdtAddress: text("usdt_address").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at")
});
var referralCommissions = pgTable("referral_commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  investmentId: varchar("investment_id").notNull().references(() => investments.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  details: text("details"),
  targetUserId: varchar("target_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});
var insertUserSchema = createInsertSchema(users).pick({
  fullName: true,
  email: true,
  password: true,
  referredBy: true
});
var loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
var registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  referralCode: z.string().optional(),
  deviceId: z.string().optional()
});
var depositSchema = z.object({
  amount: z.number().min(5),
  txid: z.string().min(1),
  screenshotUrl: z.string().optional()
});
var withdrawalSchema = z.object({
  amount: z.number().min(20),
  usdtAddress: z.string().min(10)
});

// server/db.ts
var pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
var db = drizzle(pool, { schema: schema_exports });

// server/storage.ts
function generateReferralCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
async function createUser(data) {
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
    emailVerified: true
  }).returning();
  return user;
}
async function getUserByEmail(email) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user;
}
async function getUserById(id) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}
async function getUserByReferralCode(code) {
  const [user] = await db.select().from(users).where(eq(users.referralCode, code.toUpperCase()));
  return user;
}
async function getUserByDeviceId(deviceId) {
  const [user] = await db.select().from(users).where(eq(users.deviceId, deviceId));
  return user;
}
async function getReferralCount(userId) {
  const result = await db.select().from(users).where(eq(users.referredBy, userId));
  return result.length;
}
async function updateUserBalance(userId, amount) {
  await db.update(users).set({
    balance: sql2`${users.balance}::numeric + ${amount}::numeric`
  }).where(eq(users.id, userId));
}
async function setUserBalance(userId, balance) {
  await db.update(users).set({ balance }).where(eq(users.id, userId));
}
async function blockUser(userId, blocked) {
  await db.update(users).set({ isBlocked: blocked }).where(eq(users.id, userId));
}
async function getAllUsers() {
  return db.select().from(users).orderBy(desc(users.createdAt));
}
async function createOTP(email, code) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
  const [otp] = await db.insert(otpCodes).values({
    email: email.toLowerCase(),
    code,
    expiresAt
  }).returning();
  return otp;
}
async function getLatestOTP(email) {
  const [otp] = await db.select().from(otpCodes).where(and(
    eq(otpCodes.email, email.toLowerCase()),
    eq(otpCodes.verified, false),
    gt(otpCodes.expiresAt, /* @__PURE__ */ new Date())
  )).orderBy(desc(otpCodes.createdAt)).limit(1);
  return otp;
}
async function incrementOTPAttempts(otpId) {
  await db.update(otpCodes).set({
    attempts: sql2`${otpCodes.attempts} + 1`
  }).where(eq(otpCodes.id, otpId));
}
async function markOTPVerified(otpId) {
  await db.update(otpCodes).set({ verified: true }).where(eq(otpCodes.id, otpId));
}
async function createDeposit(data) {
  const [deposit] = await db.insert(deposits).values({
    userId: data.userId,
    amount: data.amount,
    txid: data.txid,
    screenshotUrl: data.screenshotUrl || null
  }).returning();
  return deposit;
}
async function getDepositsByUser(userId) {
  return db.select().from(deposits).where(eq(deposits.userId, userId)).orderBy(desc(deposits.createdAt));
}
async function getDepositById(depositId) {
  const [deposit] = await db.select().from(deposits).where(eq(deposits.id, depositId));
  return deposit;
}
async function getAllDeposits() {
  const result = await db.select({
    id: deposits.id,
    userId: deposits.userId,
    amount: deposits.amount,
    txid: deposits.txid,
    screenshotUrl: deposits.screenshotUrl,
    status: deposits.status,
    createdAt: deposits.createdAt,
    reviewedAt: deposits.reviewedAt,
    userName: users.fullName,
    userEmail: users.email
  }).from(deposits).leftJoin(users, eq(deposits.userId, users.id)).orderBy(desc(deposits.createdAt));
  return result;
}
async function updateDepositStatus(depositId, status) {
  const [deposit] = await db.update(deposits).set({
    status,
    reviewedAt: /* @__PURE__ */ new Date()
  }).where(eq(deposits.id, depositId)).returning();
  return deposit;
}
async function getApprovedDepositsWithoutInvestment(userId) {
  const userInvestments = await db.select({ depositId: investments.depositId }).from(investments).where(eq(investments.userId, userId));
  const investedDepositIds = userInvestments.map((i) => i.depositId);
  const approvedDeposits = await db.select().from(deposits).where(
    and(
      eq(deposits.userId, userId),
      eq(deposits.status, "approved")
    )
  ).orderBy(desc(deposits.createdAt));
  return approvedDeposits.filter((d) => !investedDepositIds.includes(d.id));
}
async function createInvestment(data) {
  const maturesAt = new Date(Date.now() + 72 * 60 * 60 * 1e3);
  const [investment] = await db.insert(investments).values({
    userId: data.userId,
    depositId: data.depositId,
    amount: data.amount,
    profitRate: data.profitRate,
    maturesAt
  }).returning();
  return investment;
}
async function getInvestmentsByUser(userId) {
  return db.select().from(investments).where(eq(investments.userId, userId)).orderBy(desc(investments.startedAt));
}
async function getAllInvestments() {
  return db.select().from(investments).orderBy(desc(investments.startedAt));
}
async function getMatureInvestments() {
  return db.select().from(investments).where(
    and(
      eq(investments.status, "active"),
      eq(investments.profitPaid, false),
      lte(investments.maturesAt, /* @__PURE__ */ new Date())
    )
  );
}
async function markInvestmentPaid(investmentId) {
  await db.update(investments).set({
    profitPaid: true,
    status: "completed"
  }).where(eq(investments.id, investmentId));
}
async function hasInvestmentForDeposit(depositId) {
  const [existing] = await db.select().from(investments).where(eq(investments.depositId, depositId));
  return !!existing;
}
async function createWithdrawal(data) {
  const [withdrawal] = await db.insert(withdrawals).values({
    userId: data.userId,
    amount: data.amount,
    usdtAddress: data.usdtAddress
  }).returning();
  return withdrawal;
}
async function getWithdrawalsByUser(userId) {
  return db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt));
}
async function getAllWithdrawals() {
  const result = await db.select({
    id: withdrawals.id,
    userId: withdrawals.userId,
    amount: withdrawals.amount,
    usdtAddress: withdrawals.usdtAddress,
    status: withdrawals.status,
    createdAt: withdrawals.createdAt,
    reviewedAt: withdrawals.reviewedAt,
    userName: users.fullName,
    userEmail: users.email
  }).from(withdrawals).leftJoin(users, eq(withdrawals.userId, users.id)).orderBy(desc(withdrawals.createdAt));
  return result;
}
async function updateWithdrawalStatus(withdrawalId, status) {
  const [withdrawal] = await db.update(withdrawals).set({
    status,
    reviewedAt: /* @__PURE__ */ new Date()
  }).where(eq(withdrawals.id, withdrawalId)).returning();
  return withdrawal;
}
async function createReferralCommission(data) {
  const [commission] = await db.insert(referralCommissions).values(data).returning();
  return commission;
}
async function getReferrals(userId) {
  return db.select().from(users).where(eq(users.referredBy, userId));
}
async function getReferralsWithDepositInfo(userId) {
  const referredUsers = await db.select().from(users).where(eq(users.referredBy, userId));
  const result = [];
  for (const u of referredUsers) {
    const userDeposits = await db.select().from(deposits).where(
      and(eq(deposits.userId, u.id), eq(deposits.status, "approved"))
    );
    const totalDeposited = userDeposits.reduce((sum2, d) => sum2 + parseFloat(d.amount), 0);
    result.push({ ...u, totalDeposited, isQualified: totalDeposited >= 50 });
  }
  return result;
}
async function incrementQualifiedReferrals(userId) {
  const [updated] = await db.update(users).set({
    qualifiedReferrals: sql2`${users.qualifiedReferrals} + 1`,
    totalYieldPercent: sql2`LEAST(30, ${users.totalYieldPercent} + 1)`
  }).where(eq(users.id, userId)).returning();
  return updated;
}
async function markWelcomeBonusPaid(userId) {
  await db.update(users).set({ welcomeBonusPaid: true }).where(eq(users.id, userId));
}
async function markReferralBonusPaid(userId) {
  await db.update(users).set({ referralBonusPaid: true }).where(eq(users.id, userId));
}
async function setUserYieldPercent(userId, yieldPercent) {
  await db.update(users).set({ totalYieldPercent: Math.min(30, yieldPercent) }).where(eq(users.id, userId));
}
async function getTotalApprovedDeposits(userId) {
  const userDeposits = await db.select().from(deposits).where(
    and(eq(deposits.userId, userId), eq(deposits.status, "approved"))
  );
  return userDeposits.reduce((sum2, d) => sum2 + parseFloat(d.amount), 0);
}
async function hasQualifiedReferralFor(referrerId, referredUserId) {
  const commissions = await db.select().from(referralCommissions).where(
    and(
      eq(referralCommissions.referrerId, referrerId),
      eq(referralCommissions.fromUserId, referredUserId)
    )
  );
  return commissions.length > 0;
}
async function createAuditLog(data) {
  await db.insert(auditLogs).values(data);
}
async function getAuditLogs() {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
}
async function getAllReferralCommissions() {
  const allCommissions = await db.select().from(referralCommissions).orderBy(desc(referralCommissions.createdAt));
  const result = await Promise.all(allCommissions.map(async (commission) => {
    const referrer = await getUserById(commission.referrerId);
    const fromUser = await getUserById(commission.fromUserId);
    return {
      ...commission,
      referrerName: referrer?.fullName,
      referrerEmail: referrer?.email,
      fromUserName: fromUser?.fullName,
      fromUserEmail: fromUser?.email
    };
  }));
  return result;
}
async function getUserDetail(userId) {
  const user = await getUserById(userId);
  if (!user) return void 0;
  const [deposits2, withdrawals2, investments2, referrals] = await Promise.all([
    getDepositsByUser(userId),
    getWithdrawalsByUser(userId),
    getInvestmentsByUser(userId),
    getReferrals(userId)
  ]);
  const referredBy = user.referredBy ? await getUserById(user.referredBy) : void 0;
  return {
    user,
    deposits: deposits2,
    withdrawals: withdrawals2,
    investments: investments2,
    referrals,
    referredBy
  };
}
async function getInvestmentsWithUserInfo() {
  const result = await db.select({
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
    userEmail: users.email
  }).from(investments).leftJoin(users, eq(investments.userId, users.id)).orderBy(desc(investments.startedAt));
  return result;
}
async function getTodayProfit() {
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const result = await db.select({
    total: sum(investments.amount)
  }).from(investments).where(
    and(
      eq(investments.status, "completed"),
      eq(investments.profitPaid, true),
      gte(investments.maturesAt, today),
      lte(investments.maturesAt, tomorrow)
    )
  );
  const total = result[0]?.total;
  return total ? parseFloat(total) : 0;
}
async function getTotalReferralEarnings() {
  const result = await db.select({
    total: sum(referralCommissions.amount)
  }).from(referralCommissions);
  const total = result[0]?.total;
  return total ? parseFloat(total) : 0;
}

// server/email.ts
import nodemailer from "nodemailer";
var EMAIL_USER = process.env.EMAIL_USER || "yieldly@gmail.com";
var EMAIL_PASS = process.env.EMAIL_PASS || "";
var BLOCKED_DOMAINS = [
  "temp-mail.org",
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "throwaway.email",
  "tempail.com",
  "fakeinbox.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "grr.la",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.de",
  "yopmail.com",
  "yopmail.fr",
  "trashmail.com",
  "trashmail.net",
  "trashmail.me",
  "dispostable.com",
  "mailnesia.com",
  "tempinbox.com",
  "maildrop.cc",
  "mailnull.com",
  "spamgourmet.com",
  "harakirimail.com",
  "tempmail.ninja",
  "getnada.com",
  "emailondeck.com",
  "mohmal.com",
  "discard.email",
  "33mail.com",
  "mailcatch.com",
  "tempr.email",
  "temp-mail.io",
  "tempmailo.com",
  "minutemail.com",
  "emailfake.com",
  "burnermail.io",
  "inboxbear.com",
  "mytemp.email",
  "mt2015.com",
  "sharklasers.com",
  "tmail.ws",
  "tmpmail.net",
  "tmpmail.org",
  "boun.cr",
  "mailexpire.com",
  "throwam.com",
  "jetable.org"
];
function isTemporaryEmail(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return BLOCKED_DOMAINS.includes(domain);
}
var transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });
  }
  return transporter;
}
function generateOTP() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
async function sendOTPEmail(email, code) {
  if (!EMAIL_PASS) {
    console.warn("EMAIL_PASS not set - OTP email will be logged to console");
    console.log(`[OTP] Code for ${email}: ${code}`);
    return true;
  }
  try {
    const mailTransporter = getTransporter();
    await mailTransporter.sendMail({
      from: `"Yieldly" <${EMAIL_USER}>`,
      to: email,
      subject: "Your Yieldly OTP Code",
      text: `Your OTP is: ${code}. Valid for 10 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0A0A0A;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#10B981;font-size:28px;margin:0;">Yieldly</h1>
            <p style="color:#9CA3AF;font-size:14px;margin-top:4px;">Secure USDT Investment Platform</p>
          </div>
          <div style="background:#1E1E1E;border-radius:8px;padding:24px;text-align:center;">
            <p style="color:#D1D5DB;font-size:14px;margin:0 0 16px 0;">Your OTP is:</p>
            <div style="background:#2A2A2A;border-radius:8px;padding:16px;display:inline-block;letter-spacing:8px;">
              <span style="color:#10B981;font-size:32px;font-weight:700;">${code}</span>
            </div>
            <p style="color:#6B7280;font-size:12px;margin:16px 0 0 0;">Valid for 10 minutes. Do not share it with anyone.</p>
          </div>
          <p style="color:#4B5563;font-size:11px;text-align:center;margin-top:24px;">
            If you did not request this code, please ignore this email.
          </p>
        </div>
      `
    });
    return true;
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    return false;
  }
}

// server/routes.ts
var JWT_SECRET = process.env.SESSION_SECRET || "yieldly-secret-key-2024";
var ADMIN_USERNAME = "yieldly";
var ADMIN_PASSWORD = "@eleven0011";
var PLATFORM_WALLET = "TLfixnZVqzmTp2UhQwHjPiiV9eK3NemLy7";
var loginAttempts = /* @__PURE__ */ new Map();
var MAX_LOGIN_ATTEMPTS = 5;
var LOCKOUT_DURATION = 15 * 60 * 1e3;
var uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
var upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "user") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
async function processMaturedInvestments() {
  try {
    const matured = await getMatureInvestments();
    for (const inv of matured) {
      const user = await getUserById(inv.userId);
      if (!user) continue;
      const amount = parseFloat(inv.amount);
      const profitRate = parseFloat(inv.profitRate);
      const profit = amount * (profitRate / 100);
      const totalPayout = amount + profit;
      await updateUserBalance(user.id, totalPayout.toFixed(6));
      await markInvestmentPaid(inv.id);
      await createAuditLog({
        action: "investment_matured",
        details: `Investment $${amount.toFixed(2)} matured at ${profitRate}% yield. Profit: $${profit.toFixed(2)}. Total payout: $${totalPayout.toFixed(2)} (principal + profit) credited to balance`,
        targetUserId: user.id
      });
      console.log(`Investment ${inv.id} matured: user ${user.id} received $${totalPayout.toFixed(2)} (principal $${amount.toFixed(2)} + profit $${profit.toFixed(2)}) at ${profitRate}% rate`);
    }
  } catch (err) {
    console.error("Error processing matured investments:", err);
  }
}
async function registerRoutes(app2) {
  cron.schedule("*/5 * * * *", processMaturedInvestments);
  app2.use("/uploads", (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    next();
  }, __require("express").static(uploadsDir));
  app2.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      const emailLower = email.trim().toLowerCase();
      if (isTemporaryEmail(emailLower)) {
        return res.status(400).json({ message: "Temporary/disposable email addresses are not allowed. Please use a real email." });
      }
      const existing = await getUserByEmail(emailLower);
      if (existing) {
        return res.status(400).json({ message: "This email is already registered. Please sign in instead." });
      }
      const existingOTP = await getLatestOTP(emailLower);
      if (existingOTP) {
        const timeSinceCreated = Date.now() - new Date(existingOTP.createdAt).getTime();
        if (timeSinceCreated < 6e4) {
          return res.status(429).json({ message: "Please wait at least 60 seconds before requesting a new code." });
        }
      }
      const code = generateOTP();
      await createOTP(emailLower, code);
      const sent = await sendOTPEmail(emailLower, code);
      if (!sent) {
        return res.status(500).json({ message: "Failed to send verification code. Please try again." });
      }
      return res.json({ message: "Verification code sent to your email" });
    } catch (err) {
      console.error("Send OTP error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and verification code are required" });
      }
      const emailLower = email.trim().toLowerCase();
      const otp = await getLatestOTP(emailLower);
      if (!otp) {
        return res.status(400).json({ message: "No valid verification code found. Please request a new one." });
      }
      if (otp.attempts >= 3) {
        return res.status(400).json({ message: "Too many failed attempts. Please request a new code." });
      }
      if (otp.code !== code.trim()) {
        await incrementOTPAttempts(otp.id);
        return res.status(400).json({ message: "Invalid verification code. Please try again." });
      }
      await markOTPVerified(otp.id);
      return res.json({ message: "Email verified successfully", verified: true });
    } catch (err) {
      console.error("Verify OTP error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { fullName, email, password, referralCode, deviceId, otpCode } = req.body;
      if (!fullName || !email || !password) {
        return res.status(400).json({ message: "Full name, email, and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const emailLower = email.trim().toLowerCase();
      if (isTemporaryEmail(emailLower)) {
        return res.status(400).json({ message: "Temporary/disposable email addresses are not allowed" });
      }
      const existing = await getUserByEmail(emailLower);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      if (otpCode) {
        const otp = await getLatestOTP(emailLower);
        if (!otp || !otp.verified) {
          const pendingOtp = await getLatestOTP(emailLower);
          if (pendingOtp && !pendingOtp.verified) {
            if (pendingOtp.attempts >= 3) {
              return res.status(400).json({ message: "Too many failed attempts. Request a new code." });
            }
            if (pendingOtp.code !== otpCode.trim()) {
              await incrementOTPAttempts(pendingOtp.id);
              return res.status(400).json({ message: "Invalid verification code" });
            }
            await markOTPVerified(pendingOtp.id);
          } else {
            return res.status(400).json({ message: "Please verify your email first" });
          }
        }
      }
      if (deviceId) {
        const deviceUser = await getUserByDeviceId(deviceId);
        if (deviceUser) {
          await createAuditLog({
            action: "duplicate_device_blocked",
            details: `Device ${deviceId} already linked to user ${deviceUser.email}. Registration blocked for ${emailLower}`
          });
          return res.status(400).json({ message: "This device is already linked to an account. One device per account only." });
        }
      }
      let referredById;
      if (referralCode) {
        const referrer = await getUserByReferralCode(referralCode);
        if (!referrer) {
          return res.status(400).json({ message: "Invalid referral code" });
        }
        referredById = referrer.id;
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await createUser({
        fullName,
        email: emailLower,
        password: hashedPassword,
        referredBy: referredById,
        deviceId
      });
      await createAuditLog({
        action: "user_registered",
        details: `New user: ${emailLower}, device: ${deviceId || "unknown"}`,
        targetUserId: user.id
      });
      const token = jwt.sign({ userId: user.id, type: "user" }, JWT_SECRET, { expiresIn: "30d" });
      const { password: _, ...userWithoutPassword } = user;
      return res.status(201).json({ user: userWithoutPassword, token });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials. Use your registered email." });
      }
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked. Contact support." });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials. Use your registered email." });
      }
      const token = jwt.sign({ userId: user.id, type: "user" }, JWT_SECRET, { expiresIn: "30d" });
      const { password: _, ...userWithoutPassword } = user;
      return res.json({ user: userWithoutPassword, token });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/user/me", authMiddleware, async (req, res) => {
    try {
      const user = await getUserById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _, ...userWithoutPassword } = user;
      const totalReferrals = await getReferralCount(user.id);
      return res.json({
        ...userWithoutPassword,
        referralCount: totalReferrals,
        qualifiedReferrals: user.qualifiedReferrals,
        totalYieldPercent: user.totalYieldPercent
      });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/wallet", authMiddleware, (_req, res) => {
    return res.json({ address: PLATFORM_WALLET });
  });
  app2.post("/api/upload", authMiddleware, upload.single("screenshot"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
  });
  app2.post("/api/deposits", authMiddleware, async (req, res) => {
    try {
      const { amount, txid, screenshotUrl } = req.body;
      if (!amount || !txid) {
        return res.status(400).json({ message: "Amount and TXID are required" });
      }
      if (parseFloat(amount) < 5) {
        return res.status(400).json({ message: "Minimum deposit is $5" });
      }
      if (!screenshotUrl) {
        return res.status(400).json({ message: "Screenshot proof is required" });
      }
      const deposit = await createDeposit({
        userId: req.userId,
        amount: parseFloat(amount).toFixed(6),
        txid,
        screenshotUrl
      });
      await createAuditLog({
        action: "deposit_submitted",
        details: `User submitted deposit of $${parseFloat(amount).toFixed(2)}, TXID: ${txid}`,
        targetUserId: req.userId
      });
      return res.status(201).json(deposit);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/deposits", authMiddleware, async (req, res) => {
    try {
      const userDeposits = await getDepositsByUser(req.userId);
      return res.json(userDeposits);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/investments", authMiddleware, async (req, res) => {
    try {
      const userInvestments = await getInvestmentsByUser(req.userId);
      return res.json(userInvestments);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/investments/available-deposits", authMiddleware, async (req, res) => {
    try {
      const availableDeposits = await getApprovedDepositsWithoutInvestment(req.userId);
      return res.json(availableDeposits);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/investments/start", authMiddleware, async (req, res) => {
    try {
      const { depositId } = req.body;
      if (!depositId) {
        return res.status(400).json({ message: "Deposit ID is required" });
      }
      const deposit = await getDepositById(depositId);
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }
      if (deposit.userId !== req.userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      if (deposit.status !== "approved") {
        return res.status(400).json({ message: "Deposit must be approved before starting an investment" });
      }
      const alreadyInvested = await hasInvestmentForDeposit(depositId);
      if (alreadyInvested) {
        return res.status(400).json({ message: "Investment already started for this deposit" });
      }
      const user = await getUserById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const profitRate = String(user.totalYieldPercent);
      const investment = await createInvestment({
        userId: req.userId,
        depositId,
        amount: deposit.amount,
        profitRate
      });
      await createAuditLog({
        action: "investment_started",
        details: `User started investment of $${parseFloat(deposit.amount).toFixed(2)} at ${profitRate}% rate`,
        targetUserId: req.userId
      });
      return res.status(201).json(investment);
    } catch (err) {
      console.error("Start investment error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/withdrawals", authMiddleware, async (req, res) => {
    try {
      const { amount, usdtAddress } = req.body;
      if (!amount || !usdtAddress) {
        return res.status(400).json({ message: "Amount and USDT address are required" });
      }
      if (parseFloat(amount) < 20) {
        return res.status(400).json({ message: "Minimum withdrawal is $20" });
      }
      const user = await getUserById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (parseFloat(user.balance) < parseFloat(amount)) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      await updateUserBalance(req.userId, (-parseFloat(amount)).toFixed(6));
      const withdrawal = await createWithdrawal({
        userId: req.userId,
        amount: parseFloat(amount).toFixed(6),
        usdtAddress
      });
      return res.status(201).json(withdrawal);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/withdrawals", authMiddleware, async (req, res) => {
    try {
      const userWithdrawals = await getWithdrawalsByUser(req.userId);
      return res.json(userWithdrawals);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/referrals", authMiddleware, async (req, res) => {
    try {
      const user = await getUserById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const referralsWithInfo = await getReferralsWithDepositInfo(req.userId);
      const totalReferrals = referralsWithInfo.length;
      const qualifiedReferrals = user.qualifiedReferrals;
      const currentYield = user.totalYieldPercent;
      const isReferred = !!user.referredBy;
      const totalDeposited = await getTotalApprovedDeposits(user.id);
      const hasQualifiedDeposit = totalDeposited >= 50;
      return res.json({
        referralCode: user.referralCode,
        totalReferrals,
        qualifiedReferrals,
        currentYield,
        maxYield: 30,
        referralBonusPaid: user.referralBonusPaid,
        isReferred,
        hasQualifiedDeposit,
        welcomeBonusPaid: user.welcomeBonusPaid,
        referrals: referralsWithInfo.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          createdAt: r.createdAt,
          totalDeposited: r.totalDeposited,
          isQualified: r.isQualified
        }))
      });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const attempts = loginAttempts.get(clientIp);
    if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS) {
      const timeSinceLast = Date.now() - attempts.lastAttempt;
      if (timeSinceLast < LOCKOUT_DURATION) {
        const remainingMinutes = Math.ceil((LOCKOUT_DURATION - timeSinceLast) / 6e4);
        return res.status(429).json({ message: `Too many failed attempts. Try again in ${remainingMinutes} minutes.` });
      }
      loginAttempts.delete(clientIp);
    }
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      loginAttempts.delete(clientIp);
      const token = jwt.sign({ type: "admin" }, JWT_SECRET, { expiresIn: "30m" });
      return res.json({ token });
    }
    const current = loginAttempts.get(clientIp) || { count: 0, lastAttempt: 0 };
    loginAttempts.set(clientIp, { count: current.count + 1, lastAttempt: Date.now() });
    return res.status(401).json({ message: "Invalid admin credentials" });
  });
  app2.get("/api/admin/stats", adminMiddleware, async (_req, res) => {
    try {
      const allUsers = await getAllUsers();
      const allDeposits = await getAllDeposits();
      const allWithdrawals = await getAllWithdrawals();
      const allInvestments = await getAllInvestments();
      const totalDeposits = allDeposits.filter((d) => d.status === "approved").reduce((s, d) => s + parseFloat(d.amount), 0);
      const totalWithdrawals = allWithdrawals.filter((w) => w.status === "processed").reduce((s, w) => s + parseFloat(w.amount), 0);
      const activeInvestments = allInvestments.filter((i) => i.status === "active").length;
      const pendingDeposits = allDeposits.filter((d) => d.status === "pending").length;
      const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending").length;
      const todayProfit = await getTodayProfit();
      const totalReferralEarnings = await getTotalReferralEarnings();
      return res.json({
        totalUsers: allUsers.length,
        totalDeposits: totalDeposits.toFixed(2),
        totalWithdrawals: totalWithdrawals.toFixed(2),
        activeInvestments,
        pendingDeposits,
        pendingWithdrawals,
        todayProfit: todayProfit.toFixed(2),
        totalReferralEarnings: totalReferralEarnings.toFixed(2)
      });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/users", adminMiddleware, async (_req, res) => {
    try {
      const allUsers = await getAllUsers();
      const usersData = await Promise.all(allUsers.map(async (u) => {
        const refCount = await getReferralCount(u.id);
        return { ...u, password: void 0, referralCount: refCount };
      }));
      return res.json(usersData);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/deposits", adminMiddleware, async (_req, res) => {
    try {
      const allDeposits = await getAllDeposits();
      return res.json(allDeposits);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/deposits/:id/approve", adminMiddleware, async (req, res) => {
    try {
      const deposit = await updateDepositStatus(req.params.id, "approved");
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });
      const user = await getUserById(deposit.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const bonusDetails = [];
      const alreadyInvested = await hasInvestmentForDeposit(deposit.id);
      if (!alreadyInvested) {
        const profitRate = String(user.totalYieldPercent);
        const investment = await createInvestment({
          userId: user.id,
          depositId: deposit.id,
          amount: deposit.amount,
          profitRate
        });
        bonusDetails.push(`72h investment auto-started at ${profitRate}% yield (ID: ${investment.id})`);
        await createAuditLog({
          action: "investment_started",
          details: `Investment of $${parseFloat(deposit.amount).toFixed(2)} auto-started at ${profitRate}% yield rate`,
          targetUserId: user.id
        });
      }
      if (user.referredBy) {
        const totalDeposited = await getTotalApprovedDeposits(user.id);
        const wasQualifiedBefore = totalDeposited - parseFloat(deposit.amount) >= 50;
        if (totalDeposited >= 50 && !wasQualifiedBefore) {
          const alreadyQualified = await hasQualifiedReferralFor(user.referredBy, user.id);
          if (!alreadyQualified) {
            const updatedReferrer = await incrementQualifiedReferrals(user.referredBy);
            await createReferralCommission({
              referrerId: user.referredBy,
              fromUserId: user.id,
              investmentId: "referral-qualification",
              amount: "0"
            });
            const referrer = await getUserById(user.referredBy);
            bonusDetails.push(`Referrer ${referrer?.email} qualified referral count increased to ${updatedReferrer?.qualifiedReferrals}, yield now ${updatedReferrer?.totalYieldPercent}%`);
            await createAuditLog({
              action: "referral_qualified",
              details: `User ${user.email} deposited $${totalDeposited.toFixed(2)} total (>=$50). Referrer ${referrer?.email} now has ${updatedReferrer?.qualifiedReferrals} qualified referrals, yield ${updatedReferrer?.totalYieldPercent}%`,
              targetUserId: user.referredBy
            });
            if (updatedReferrer && updatedReferrer.qualifiedReferrals >= 20 && !updatedReferrer.referralBonusPaid) {
              await updateUserBalance(user.referredBy, "30");
              await markReferralBonusPaid(user.referredBy);
              bonusDetails.push(`Referrer ${referrer?.email} earned $30 milestone bonus for 20+ qualified referrals`);
              await createAuditLog({
                action: "referral_milestone_bonus",
                details: `Referrer ${referrer?.email} reached 20 qualified referrals, $30 bonus paid`,
                targetUserId: user.referredBy
              });
            }
          }
          if (!user.welcomeBonusPaid) {
            await updateUserBalance(user.id, "5");
            await markWelcomeBonusPaid(user.id);
            const newYield = 11;
            await setUserYieldPercent(user.id, newYield);
            bonusDetails.push(`User ${user.email} received $5 welcome bonus and 11% yield for depositing $50+`);
            await createAuditLog({
              action: "welcome_bonus_paid",
              details: `User ${user.email} received $5 welcome bonus. Yield set to 11% (referred user with $50+ deposit)`,
              targetUserId: user.id
            });
          }
        }
      }
      await createAuditLog({
        action: "deposit_approved",
        details: `Deposit $${deposit.amount} approved for user ${user.email}. Investment auto-started.${bonusDetails.length > 0 ? " " + bonusDetails.join(". ") : ""}`,
        targetUserId: user.id
      });
      return res.json({ message: "Deposit approved. 72-hour investment started automatically." });
    } catch (err) {
      console.error("Approve deposit error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/deposits/:id/reject", adminMiddleware, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({ message: "Rejection reason is required (minimum 10 characters)" });
      }
      const deposit = await updateDepositStatus(req.params.id, "rejected");
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });
      await createAuditLog({
        action: "deposit_rejected",
        details: `Deposit $${deposit.amount} rejected. Reason: ${reason.trim()}`,
        targetUserId: deposit.userId
      });
      return res.json({ message: "Deposit rejected" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/withdrawals", adminMiddleware, async (_req, res) => {
    try {
      const allWithdrawals = await getAllWithdrawals();
      return res.json(allWithdrawals);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/withdrawals/:id/process", adminMiddleware, async (req, res) => {
    try {
      const withdrawal = await updateWithdrawalStatus(req.params.id, "processed");
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
      await createAuditLog({
        action: "withdrawal_processed",
        details: `Withdrawal $${withdrawal.amount} processed to ${withdrawal.usdtAddress}`,
        targetUserId: withdrawal.userId
      });
      return res.json({ message: "Withdrawal processed" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/withdrawals/:id/reject", adminMiddleware, async (req, res) => {
    try {
      const withdrawal = await updateWithdrawalStatus(req.params.id, "rejected");
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
      await updateUserBalance(withdrawal.userId, withdrawal.amount);
      await createAuditLog({
        action: "withdrawal_rejected",
        details: `Withdrawal $${withdrawal.amount} rejected, balance refunded`,
        targetUserId: withdrawal.userId
      });
      return res.json({ message: "Withdrawal rejected, balance refunded" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/users/:id/block", adminMiddleware, async (req, res) => {
    try {
      await blockUser(req.params.id, true);
      await createAuditLog({
        action: "user_blocked",
        details: `User blocked`,
        targetUserId: req.params.id
      });
      return res.json({ message: "User blocked" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/users/:id/unblock", adminMiddleware, async (req, res) => {
    try {
      await blockUser(req.params.id, false);
      await createAuditLog({
        action: "user_unblocked",
        details: `User unblocked`,
        targetUserId: req.params.id
      });
      return res.json({ message: "User unblocked" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.post("/api/admin/users/:id/balance", adminMiddleware, async (req, res) => {
    try {
      const { balance, reason } = req.body;
      if (balance === void 0) return res.status(400).json({ message: "Balance required" });
      if (!reason || reason.trim().length < 1) return res.status(400).json({ message: "Reason is required" });
      await setUserBalance(req.params.id, parseFloat(balance).toFixed(6));
      await createAuditLog({
        action: "balance_adjusted",
        details: `Balance set to $${balance}. Reason: ${reason.trim()}`,
        targetUserId: req.params.id
      });
      return res.json({ message: "Balance updated" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/investments", adminMiddleware, async (_req, res) => {
    try {
      const allInvestments = await getInvestmentsWithUserInfo();
      return res.json(allInvestments);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/audit-logs", adminMiddleware, async (_req, res) => {
    try {
      const logs = await getAuditLogs();
      return res.json(logs);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/users/:id/detail", adminMiddleware, async (req, res) => {
    try {
      const detail = await getUserDetail(req.params.id);
      if (!detail) return res.status(404).json({ message: "User not found" });
      return res.json(detail);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/referral-commissions", adminMiddleware, async (_req, res) => {
    try {
      const commissions = await getAllReferralCommissions();
      return res.json(commissions);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/export/users", adminMiddleware, async (_req, res) => {
    try {
      const allUsers = await getAllUsers();
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=users.csv");
      const escapeCSV = (val) => {
        if (val === null || val === void 0) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      const headers = ["id", "fullName", "email", "balance", "referralCode", "qualifiedReferrals", "totalYieldPercent", "isBlocked", "createdAt"];
      let csv = headers.join(",") + "\n";
      for (const u of allUsers) {
        csv += [
          escapeCSV(u.id),
          escapeCSV(u.fullName),
          escapeCSV(u.email),
          escapeCSV(u.balance),
          escapeCSV(u.referralCode),
          escapeCSV(u.qualifiedReferrals),
          escapeCSV(u.totalYieldPercent),
          escapeCSV(u.isBlocked),
          escapeCSV(u.createdAt)
        ].join(",") + "\n";
      }
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/export/deposits", adminMiddleware, async (_req, res) => {
    try {
      const allDeposits = await getAllDeposits();
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=deposits.csv");
      const escapeCSV = (val) => {
        if (val === null || val === void 0) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      const headers = ["id", "userId", "userName", "userEmail", "amount", "txid", "status", "createdAt", "reviewedAt"];
      let csv = headers.join(",") + "\n";
      for (const d of allDeposits) {
        csv += [
          escapeCSV(d.id),
          escapeCSV(d.userId),
          escapeCSV(d.userName),
          escapeCSV(d.userEmail),
          escapeCSV(d.amount),
          escapeCSV(d.txid),
          escapeCSV(d.status),
          escapeCSV(d.createdAt),
          escapeCSV(d.reviewedAt)
        ].join(",") + "\n";
      }
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  app2.get("/api/admin/export/withdrawals", adminMiddleware, async (_req, res) => {
    try {
      const allWithdrawals = await getAllWithdrawals();
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=withdrawals.csv");
      const escapeCSV = (val) => {
        if (val === null || val === void 0) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };
      const headers = ["id", "userId", "userName", "userEmail", "amount", "usdtAddress", "status", "createdAt", "reviewedAt"];
      let csv = headers.join(",") + "\n";
      for (const w of allWithdrawals) {
        csv += [
          escapeCSV(w.id),
          escapeCSV(w.userId),
          escapeCSV(w.userName),
          escapeCSV(w.userEmail),
          escapeCSV(w.amount),
          escapeCSV(w.usdtAddress),
          escapeCSV(w.status),
          escapeCSV(w.createdAt),
          escapeCSV(w.reviewedAt)
        ].join(",") + "\n";
      }
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  const adminTemplatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin.html"
  );
  const adminTemplate = fs2.readFileSync(adminTemplatePath, "utf-8");
  const termsTemplatePath = path2.resolve(process.cwd(), "server", "templates", "terms.html");
  const termsTemplate = fs2.readFileSync(termsTemplatePath, "utf-8");
  const privacyTemplatePath = path2.resolve(process.cwd(), "server", "templates", "privacy.html");
  const privacyTemplate = fs2.readFileSync(privacyTemplatePath, "utf-8");
  app2.use((req, res, next) => {
    if (req.path === "/admin") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(adminTemplate);
    }
    if (req.path === "/terms") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(termsTemplate);
    }
    if (req.path === "/privacy") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(privacyTemplate);
    }
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
  if (process.env.NODE_ENV === "production" && port !== 8081) {
    const { createServer: createServer2 } = await import("node:http");
    const proxyServer = createServer2(app);
    proxyServer.listen(
      {
        port: 8081,
        host: "0.0.0.0",
        reusePort: true
      },
      () => {
        log(`express server also serving on port 8081 for deployment`);
      }
    );
  }
})();
