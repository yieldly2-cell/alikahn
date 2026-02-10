import { sql } from "drizzle-orm";
import { pgTable, text, varchar, numeric, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  balance: numeric("balance", { precision: 20, scale: 6 }).notNull().default("0"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  deviceId: text("device_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deposits = pgTable("deposits", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  txid: text("txid").notNull(),
  screenshotUrl: text("screenshot_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const investments = pgTable("investments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  depositId: varchar("deposit_id").notNull().references(() => deposits.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  profitRate: numeric("profit_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  maturesAt: timestamp("matures_at").notNull(),
  profitPaid: boolean("profit_paid").notNull().default(false),
  status: text("status").notNull().default("active"),
});

export const withdrawals = pgTable("withdrawals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  usdtAddress: text("usdt_address").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const referralCommissions = pgTable("referral_commissions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  investmentId: varchar("investment_id").notNull().references(() => investments.id),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  details: text("details"),
  targetUserId: varchar("target_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  fullName: true,
  email: true,
  password: true,
  referredBy: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  referralCode: z.string().optional(),
  deviceId: z.string().optional(),
});

export const depositSchema = z.object({
  amount: z.number().min(5),
  txid: z.string().min(1),
  screenshotUrl: z.string().optional(),
});

export const withdrawalSchema = z.object({
  amount: z.number().min(20),
  usdtAddress: z.string().min(10),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type Investment = typeof investments.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type ReferralCommission = typeof referralCommissions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
