import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as storage from "./storage";
import { isTemporaryEmail, generateOTP, sendOTPEmail } from "./email";

const JWT_SECRET = process.env.SESSION_SECRET || "yieldly-secret-key-2024";
const ADMIN_USERNAME = "yieldly";
const ADMIN_PASSWORD = "@eleven0011";
const PLATFORM_WALLET = "TLfixnZVqzmTp2UhQwHjPiiV9eK3NemLy7";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

interface AuthRequest extends Request {
  userId?: string;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; type: string };
    if (decoded.type !== "user") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { type: string };
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
    const matured = await storage.getMatureInvestments();
    for (const inv of matured) {
      const user = await storage.getUserById(inv.userId);
      if (!user) continue;

      const amount = parseFloat(inv.amount);
      const referralCount = await storage.getReferralCount(user.id);

      let totalRate = 10;
      if (referralCount >= 3) totalRate = 13;
      else if (referralCount >= 2) totalRate = 12;
      else if (referralCount >= 1) totalRate = 11;

      const userProfit = amount * 0.10;
      const referralBonus = amount * ((totalRate - 10) / 100);

      await storage.updateUserBalance(user.id, (amount + userProfit).toFixed(6));
      await storage.markInvestmentPaid(inv.id);

      if (referralBonus > 0 && user.referredBy) {
        const referrer = await storage.getUserById(user.referredBy);
        if (referrer) {
          await storage.updateUserBalance(referrer.id, referralBonus.toFixed(6));
          await storage.createReferralCommission({
            referrerId: referrer.id,
            fromUserId: user.id,
            investmentId: inv.id,
            amount: referralBonus.toFixed(6),
          });
        }
      }

      console.log(`Investment ${inv.id} matured: user ${user.id} received $${userProfit.toFixed(2)} profit`);
    }
  } catch (err) {
    console.error("Error processing matured investments:", err);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  cron.schedule("*/5 * * * *", processMaturedInvestments);

  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    next();
  }, require("express").static(uploadsDir));

  // ==================== OTP ENDPOINTS ====================

  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const emailLower = email.trim().toLowerCase();

      if (isTemporaryEmail(emailLower)) {
        return res.status(400).json({ message: "Temporary/disposable email addresses are not allowed. Please use a real email." });
      }

      const existing = await storage.getUserByEmail(emailLower);
      if (existing) {
        return res.status(400).json({ message: "This email is already registered. Please sign in instead." });
      }

      const existingOTP = await storage.getLatestOTP(emailLower);
      if (existingOTP) {
        const timeSinceCreated = Date.now() - new Date(existingOTP.createdAt).getTime();
        if (timeSinceCreated < 60000) {
          return res.status(429).json({ message: "Please wait at least 60 seconds before requesting a new code." });
        }
      }

      const code = generateOTP();
      await storage.createOTP(emailLower, code);

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

  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and verification code are required" });
      }

      const emailLower = email.trim().toLowerCase();
      const otp = await storage.getLatestOTP(emailLower);

      if (!otp) {
        return res.status(400).json({ message: "No valid verification code found. Please request a new one." });
      }

      if (otp.attempts >= 3) {
        return res.status(400).json({ message: "Too many failed attempts. Please request a new code." });
      }

      if (otp.code !== code.trim()) {
        await storage.incrementOTPAttempts(otp.id);
        return res.status(400).json({ message: "Invalid verification code. Please try again." });
      }

      await storage.markOTPVerified(otp.id);
      return res.json({ message: "Email verified successfully", verified: true });
    } catch (err) {
      console.error("Verify OTP error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ==================== AUTH ENDPOINTS ====================

  app.post("/api/auth/register", async (req: Request, res: Response) => {
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

      const existing = await storage.getUserByEmail(emailLower);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      if (otpCode) {
        const otp = await storage.getLatestOTP(emailLower);
        if (!otp || !otp.verified) {
          const pendingOtp = await storage.getLatestOTP(emailLower);
          if (pendingOtp && !pendingOtp.verified) {
            if (pendingOtp.attempts >= 3) {
              return res.status(400).json({ message: "Too many failed attempts. Request a new code." });
            }
            if (pendingOtp.code !== otpCode.trim()) {
              await storage.incrementOTPAttempts(pendingOtp.id);
              return res.status(400).json({ message: "Invalid verification code" });
            }
            await storage.markOTPVerified(pendingOtp.id);
          } else {
            return res.status(400).json({ message: "Please verify your email first" });
          }
        }
      }

      if (deviceId) {
        const deviceUser = await storage.getUserByDeviceId(deviceId);
        if (deviceUser) {
          await storage.createAuditLog({
            action: "duplicate_device_blocked",
            details: `Device ${deviceId} already linked to user ${deviceUser.email}. Registration blocked for ${emailLower}`,
          });
          return res.status(400).json({ message: "This device is already linked to an account. One device per account only." });
        }
      }

      let referredById: string | undefined;
      if (referralCode) {
        const referrer = await storage.getUserByReferralCode(referralCode);
        if (!referrer) {
          return res.status(400).json({ message: "Invalid referral code" });
        }
        referredById = referrer.id;
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await storage.createUser({
        fullName,
        email: emailLower,
        password: hashedPassword,
        referredBy: referredById,
        deviceId,
      });

      await storage.createAuditLog({
        action: "user_registered",
        details: `New user: ${emailLower}, device: ${deviceId || "unknown"}`,
        targetUserId: user.id,
      });

      const token = jwt.sign({ userId: user.id, type: "user" }, JWT_SECRET, { expiresIn: "30d" });
      const { password: _, ...userWithoutPassword } = user;

      return res.status(201).json({ user: userWithoutPassword, token });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
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

  app.get("/api/user/me", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _, ...userWithoutPassword } = user;
      const referralCount = await storage.getReferralCount(user.id);
      return res.json({ ...userWithoutPassword, referralCount });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/wallet", authMiddleware as any, (_req: Request, res: Response) => {
    return res.json({ address: PLATFORM_WALLET });
  });

  // ==================== UPLOAD ENDPOINT ====================

  app.post("/api/upload", authMiddleware as any, upload.single("screenshot"), (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
  });

  // ==================== DEPOSIT ENDPOINTS ====================

  app.post("/api/deposits", authMiddleware as any, async (req: AuthRequest, res: Response) => {
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

      const deposit = await storage.createDeposit({
        userId: req.userId!,
        amount: parseFloat(amount).toFixed(6),
        txid,
        screenshotUrl,
      });

      await storage.createAuditLog({
        action: "deposit_submitted",
        details: `User submitted deposit of $${parseFloat(amount).toFixed(2)}, TXID: ${txid}`,
        targetUserId: req.userId,
      });

      return res.status(201).json(deposit);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/deposits", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const userDeposits = await storage.getDepositsByUser(req.userId!);
      return res.json(userDeposits);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ==================== INVESTMENT ENDPOINTS ====================

  app.get("/api/investments", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const userInvestments = await storage.getInvestmentsByUser(req.userId!);
      return res.json(userInvestments);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/investments/available-deposits", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const availableDeposits = await storage.getApprovedDepositsWithoutInvestment(req.userId!);
      return res.json(availableDeposits);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/investments/start", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const { depositId } = req.body;
      if (!depositId) {
        return res.status(400).json({ message: "Deposit ID is required" });
      }

      const deposit = await storage.getDepositById(depositId);
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }
      if (deposit.userId !== req.userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      if (deposit.status !== "approved") {
        return res.status(400).json({ message: "Deposit must be approved before starting an investment" });
      }

      const alreadyInvested = await storage.hasInvestmentForDeposit(depositId);
      if (alreadyInvested) {
        return res.status(400).json({ message: "Investment already started for this deposit" });
      }

      const user = await storage.getUserById(req.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const referralCount = await storage.getReferralCount(user.id);
      let profitRate = "10";
      if (referralCount >= 3) profitRate = "13";
      else if (referralCount >= 2) profitRate = "12";
      else if (referralCount >= 1) profitRate = "11";

      const investment = await storage.createInvestment({
        userId: req.userId!,
        depositId,
        amount: deposit.amount,
        profitRate,
      });

      await storage.createAuditLog({
        action: "investment_started",
        details: `User started investment of $${parseFloat(deposit.amount).toFixed(2)} at ${profitRate}% rate`,
        targetUserId: req.userId,
      });

      return res.status(201).json(investment);
    } catch (err) {
      console.error("Start investment error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ==================== WITHDRAWAL ENDPOINTS ====================

  app.post("/api/withdrawals", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const { amount, usdtAddress } = req.body;
      if (!amount || !usdtAddress) {
        return res.status(400).json({ message: "Amount and USDT address are required" });
      }
      if (parseFloat(amount) < 20) {
        return res.status(400).json({ message: "Minimum withdrawal is $20" });
      }

      const user = await storage.getUserById(req.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (parseFloat(user.balance) < parseFloat(amount)) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      await storage.updateUserBalance(req.userId!, (-parseFloat(amount)).toFixed(6));

      const withdrawal = await storage.createWithdrawal({
        userId: req.userId!,
        amount: parseFloat(amount).toFixed(6),
        usdtAddress,
      });

      return res.status(201).json(withdrawal);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/withdrawals", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const userWithdrawals = await storage.getWithdrawalsByUser(req.userId!);
      return res.json(userWithdrawals);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ==================== REFERRAL ENDPOINTS ====================

  app.get("/api/referrals", authMiddleware as any, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });

      const referrals = await storage.getReferrals(req.userId!);
      const commissions = await storage.getCommissionsByUser(req.userId!);
      const referralCount = referrals.length;

      let currentTier = "10%";
      if (referralCount >= 3) currentTier = "13%";
      else if (referralCount >= 2) currentTier = "12%";
      else if (referralCount >= 1) currentTier = "11%";

      const totalEarnings = commissions.reduce((sum, c) => sum + parseFloat(c.amount), 0);

      return res.json({
        referralCode: user.referralCode,
        referralCount,
        currentTier,
        totalEarnings: totalEarnings.toFixed(2),
        referrals: referrals.map(r => ({
          id: r.id,
          fullName: r.fullName,
          createdAt: r.createdAt,
        })),
        commissions,
      });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ==================== ADMIN ENDPOINTS ====================

  app.post("/api/admin/login", (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ type: "admin" }, JWT_SECRET, { expiresIn: "24h" });
      return res.json({ token });
    }
    return res.status(401).json({ message: "Invalid admin credentials" });
  });

  app.get("/api/admin/stats", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allDeposits = await storage.getAllDeposits();
      const allWithdrawals = await storage.getAllWithdrawals();
      const allInvestments = await storage.getAllInvestments();

      const totalDeposits = allDeposits.filter(d => d.status === "approved").reduce((s, d) => s + parseFloat(d.amount), 0);
      const totalWithdrawals = allWithdrawals.filter(w => w.status === "processed").reduce((s, w) => s + parseFloat(w.amount), 0);
      const activeInvestments = allInvestments.filter(i => i.status === "active").length;
      const pendingDeposits = allDeposits.filter(d => d.status === "pending").length;
      const pendingWithdrawals = allWithdrawals.filter(w => w.status === "pending").length;

      return res.json({
        totalUsers: allUsers.length,
        totalDeposits: totalDeposits.toFixed(2),
        totalWithdrawals: totalWithdrawals.toFixed(2),
        activeInvestments,
        pendingDeposits,
        pendingWithdrawals,
      });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/users", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const usersData = await Promise.all(allUsers.map(async (u) => {
        const refCount = await storage.getReferralCount(u.id);
        return { ...u, password: undefined, referralCount: refCount };
      }));
      return res.json(usersData);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/deposits", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allDeposits = await storage.getAllDeposits();
      return res.json(allDeposits);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/deposits/:id/approve", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const deposit = await storage.updateDepositStatus(req.params.id, "approved");
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });

      const user = await storage.getUserById(deposit.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.updateUserBalance(deposit.userId, deposit.amount);

      await storage.createAuditLog({
        action: "deposit_approved",
        details: `Deposit $${deposit.amount} approved for user ${user.email}. Balance credited. User must manually start investment.`,
        targetUserId: user.id,
      });

      return res.json({ message: "Deposit approved, balance credited. User will start investment manually." });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/deposits/:id/reject", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const deposit = await storage.updateDepositStatus(req.params.id, "rejected");
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });

      await storage.createAuditLog({
        action: "deposit_rejected",
        details: `Deposit $${deposit.amount} rejected`,
        targetUserId: deposit.userId,
      });

      return res.json({ message: "Deposit rejected" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/withdrawals", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawals();
      return res.json(allWithdrawals);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/withdrawals/:id/process", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.updateWithdrawalStatus(req.params.id, "processed");
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });

      await storage.createAuditLog({
        action: "withdrawal_processed",
        details: `Withdrawal $${withdrawal.amount} processed to ${withdrawal.usdtAddress}`,
        targetUserId: withdrawal.userId,
      });

      return res.json({ message: "Withdrawal processed" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/withdrawals/:id/reject", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.updateWithdrawalStatus(req.params.id, "rejected");
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });

      await storage.updateUserBalance(withdrawal.userId, withdrawal.amount);

      await storage.createAuditLog({
        action: "withdrawal_rejected",
        details: `Withdrawal $${withdrawal.amount} rejected, balance refunded`,
        targetUserId: withdrawal.userId,
      });

      return res.json({ message: "Withdrawal rejected, balance refunded" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/users/:id/block", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      await storage.blockUser(req.params.id, true);
      await storage.createAuditLog({
        action: "user_blocked",
        details: `User blocked`,
        targetUserId: req.params.id,
      });
      return res.json({ message: "User blocked" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/users/:id/unblock", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      await storage.blockUser(req.params.id, false);
      await storage.createAuditLog({
        action: "user_unblocked",
        details: `User unblocked`,
        targetUserId: req.params.id,
      });
      return res.json({ message: "User unblocked" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/users/:id/balance", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { balance } = req.body;
      if (balance === undefined) return res.status(400).json({ message: "Balance required" });

      await storage.setUserBalance(req.params.id, parseFloat(balance).toFixed(6));
      await storage.createAuditLog({
        action: "balance_adjusted",
        details: `Balance set to $${balance}`,
        targetUserId: req.params.id,
      });
      return res.json({ message: "Balance updated" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/investments", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allInvestments = await storage.getAllInvestments();
      return res.json(allInvestments);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/audit-logs", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const logs = await storage.getAuditLogs();
      return res.json(logs);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
