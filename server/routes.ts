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

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

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
      const profitRate = parseFloat(inv.profitRate);
      const profit = amount * (profitRate / 100);
      const totalPayout = amount + profit;

      await storage.updateUserBalance(user.id, totalPayout.toFixed(6));
      await storage.markInvestmentPaid(inv.id);

      await storage.createAuditLog({
        action: "investment_matured",
        details: `Investment $${amount.toFixed(2)} matured at ${profitRate}% yield. Profit: $${profit.toFixed(2)}. Total payout: $${totalPayout.toFixed(2)} (principal + profit) credited to balance`,
        targetUserId: user.id,
      });

      console.log(`Investment ${inv.id} matured: user ${user.id} received $${totalPayout.toFixed(2)} (principal $${amount.toFixed(2)} + profit $${profit.toFixed(2)}) at ${profitRate}% rate`);
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
      const totalReferrals = await storage.getReferralCount(user.id);
      return res.json({
        ...userWithoutPassword,
        referralCount: totalReferrals,
        qualifiedReferrals: user.qualifiedReferrals,
        totalYieldPercent: user.totalYieldPercent,
      });
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

      const profitRate = String(user.totalYieldPercent);

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

      const referralsWithInfo = await storage.getReferralsWithDepositInfo(req.userId!);
      const totalReferrals = referralsWithInfo.length;
      const qualifiedReferrals = user.qualifiedReferrals;
      const currentYield = user.totalYieldPercent;

      const isReferred = !!user.referredBy;
      const totalDeposited = await storage.getTotalApprovedDeposits(user.id);
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
        referrals: referralsWithInfo.map(r => ({
          id: r.id,
          fullName: r.fullName,
          createdAt: r.createdAt,
          totalDeposited: r.totalDeposited,
          isQualified: r.isQualified,
        })),
      });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ==================== ADMIN ENDPOINTS ====================

  app.post("/api/admin/login", (req: Request, res: Response) => {
    const { username, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";

    const attempts = loginAttempts.get(clientIp);
    if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS) {
      const timeSinceLast = Date.now() - attempts.lastAttempt;
      if (timeSinceLast < LOCKOUT_DURATION) {
        const remainingMinutes = Math.ceil((LOCKOUT_DURATION - timeSinceLast) / 60000);
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

      const todayProfit = await storage.getTodayProfit();
      const totalReferralEarnings = await storage.getTotalReferralEarnings();

      return res.json({
        totalUsers: allUsers.length,
        totalDeposits: totalDeposits.toFixed(2),
        totalWithdrawals: totalWithdrawals.toFixed(2),
        activeInvestments,
        pendingDeposits,
        pendingWithdrawals,
        todayProfit: todayProfit.toFixed(2),
        totalReferralEarnings: totalReferralEarnings.toFixed(2),
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

      const bonusDetails: string[] = [];

      const alreadyInvested = await storage.hasInvestmentForDeposit(deposit.id);
      if (!alreadyInvested) {
        const profitRate = String(user.totalYieldPercent);
        const investment = await storage.createInvestment({
          userId: user.id,
          depositId: deposit.id,
          amount: deposit.amount,
          profitRate,
        });
        bonusDetails.push(`72h investment auto-started at ${profitRate}% yield (ID: ${investment.id})`);

        await storage.createAuditLog({
          action: "investment_started",
          details: `Investment of $${parseFloat(deposit.amount).toFixed(2)} auto-started at ${profitRate}% yield rate`,
          targetUserId: user.id,
        });
      }

      if (user.referredBy) {
        const totalDeposited = await storage.getTotalApprovedDeposits(user.id);
        const wasQualifiedBefore = (totalDeposited - parseFloat(deposit.amount)) >= 50;

        if (totalDeposited >= 50 && !wasQualifiedBefore) {
          const alreadyQualified = await storage.hasQualifiedReferralFor(user.referredBy, user.id);
          if (!alreadyQualified) {
            const updatedReferrer = await storage.incrementQualifiedReferrals(user.referredBy);

            await storage.createReferralCommission({
              referrerId: user.referredBy,
              fromUserId: user.id,
              investmentId: "referral-qualification",
              amount: "0",
            });

            const referrer = await storage.getUserById(user.referredBy);
            bonusDetails.push(`Referrer ${referrer?.email} qualified referral count increased to ${updatedReferrer?.qualifiedReferrals}, yield now ${updatedReferrer?.totalYieldPercent}%`);

            await storage.createAuditLog({
              action: "referral_qualified",
              details: `User ${user.email} deposited $${totalDeposited.toFixed(2)} total (>=$50). Referrer ${referrer?.email} now has ${updatedReferrer?.qualifiedReferrals} qualified referrals, yield ${updatedReferrer?.totalYieldPercent}%`,
              targetUserId: user.referredBy,
            });

            if (updatedReferrer && updatedReferrer.qualifiedReferrals >= 20 && !updatedReferrer.referralBonusPaid) {
              await storage.updateUserBalance(user.referredBy, "30");
              await storage.markReferralBonusPaid(user.referredBy);
              bonusDetails.push(`Referrer ${referrer?.email} earned $30 milestone bonus for 20+ qualified referrals`);

              await storage.createAuditLog({
                action: "referral_milestone_bonus",
                details: `Referrer ${referrer?.email} reached 20 qualified referrals, $30 bonus paid`,
                targetUserId: user.referredBy,
              });
            }
          }

          if (!user.welcomeBonusPaid) {
            await storage.updateUserBalance(user.id, "5");
            await storage.markWelcomeBonusPaid(user.id);

            const newYield = 11;
            await storage.setUserYieldPercent(user.id, newYield);

            bonusDetails.push(`User ${user.email} received $5 welcome bonus and 11% yield for depositing $50+`);

            await storage.createAuditLog({
              action: "welcome_bonus_paid",
              details: `User ${user.email} received $5 welcome bonus. Yield set to 11% (referred user with $50+ deposit)`,
              targetUserId: user.id,
            });
          }
        }
      }

      await storage.createAuditLog({
        action: "deposit_approved",
        details: `Deposit $${deposit.amount} approved for user ${user.email}. Investment auto-started.${bonusDetails.length > 0 ? " " + bonusDetails.join(". ") : ""}`,
        targetUserId: user.id,
      });

      return res.json({ message: "Deposit approved. 72-hour investment started automatically." });
    } catch (err) {
      console.error("Approve deposit error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/admin/deposits/:id/reject", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({ message: "Rejection reason is required (minimum 10 characters)" });
      }

      const deposit = await storage.updateDepositStatus(req.params.id, "rejected");
      if (!deposit) return res.status(404).json({ message: "Deposit not found" });

      await storage.createAuditLog({
        action: "deposit_rejected",
        details: `Deposit $${deposit.amount} rejected. Reason: ${reason.trim()}`,
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
      const { balance, reason } = req.body;
      if (balance === undefined) return res.status(400).json({ message: "Balance required" });
      if (!reason || reason.trim().length < 1) return res.status(400).json({ message: "Reason is required" });

      await storage.setUserBalance(req.params.id, parseFloat(balance).toFixed(6));
      await storage.createAuditLog({
        action: "balance_adjusted",
        details: `Balance set to $${balance}. Reason: ${reason.trim()}`,
        targetUserId: req.params.id,
      });
      return res.json({ message: "Balance updated" });
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/investments", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allInvestments = await storage.getInvestmentsWithUserInfo();
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

  app.get("/api/admin/users/:id/detail", adminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const detail = await storage.getUserDetail(req.params.id);
      if (!detail) return res.status(404).json({ message: "User not found" });
      return res.json(detail);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/referral-commissions", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const commissions = await storage.getAllReferralCommissions();
      return res.json(commissions);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/export/users", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users.csv');

      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const headers = ['id', 'fullName', 'email', 'balance', 'referralCode', 'qualifiedReferrals', 'totalYieldPercent', 'isBlocked', 'createdAt'];
      let csv = headers.join(',') + '\n';
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
          escapeCSV(u.createdAt),
        ].join(',') + '\n';
      }
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/export/deposits", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allDeposits = await storage.getAllDeposits();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=deposits.csv');

      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const headers = ['id', 'userId', 'userName', 'userEmail', 'amount', 'txid', 'status', 'createdAt', 'reviewedAt'];
      let csv = headers.join(',') + '\n';
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
          escapeCSV(d.reviewedAt),
        ].join(',') + '\n';
      }
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/admin/export/withdrawals", adminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawals();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=withdrawals.csv');

      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const headers = ['id', 'userId', 'userName', 'userEmail', 'amount', 'usdtAddress', 'status', 'createdAt', 'reviewedAt'];
      let csv = headers.join(',') + '\n';
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
          escapeCSV(w.reviewedAt),
        ].join(',') + '\n';
      }
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ message: "Server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
