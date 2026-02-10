# Yieldly - USDT Investment Platform

## Overview

Yieldly is a USDT (TRC-20) investment platform built as a full-stack application with an Expo/React Native frontend and an Express.js backend. Users can deposit USDT, invest it for a 72-hour period to earn 10% profit, withdraw funds, and earn referral commissions through a tiered referral system. All deposits and withdrawals require manual admin approval — there is no auto-crediting of funds.

**Key business rules:**
- Currency: USDT TRC-20 only
- Minimum deposit: $5 | Minimum withdrawal: $20
- Profit: 10% after exactly 72 hours (server-side cron job)
- Referral tiers: 1 referral → 11% yield, 2 referrals → 12%, 3+ referrals → 13%
- Platform wallet: `TLfixnZVqzmTp2UhQwHjPiiV9eK3NemLy7`
- Admin credentials: username `yieldly` / password `@eleven0011`

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo/React Native)

- **Framework:** Expo SDK 54 with React Native 0.81, using expo-router for file-based routing
- **Routing structure:** Three route groups:
  - `app/index.tsx` — Auth check splash/redirect screen
  - `app/(auth)/` — Login and registration screens (presented as modal)
  - `app/(main)/` — Tab-based main app with 5 tabs: Dashboard, Deposit, Withdraw, Referrals, Settings
- **State management:** React Context (`AuthProvider`) for authentication state, `@tanstack/react-query` for server state/caching
- **Styling:** Dark theme only using `StyleSheet.create()`, with a centralized color constants file at `constants/colors.ts`. Theme uses dark backgrounds (#0A0A0A), emerald green (#10B981) accents, and gold (#F59E0B) for status indicators
- **Font:** DM Sans (Google Fonts) loaded via `@expo-google-fonts/dm-sans`
- **Auth token storage:** `@react-native-async-storage/async-storage` for persisting JWT tokens
- **API communication:** Uses `expo/fetch` with a helper `getApiUrl()` that constructs the base URL from `EXPO_PUBLIC_DOMAIN` environment variable. Auth tokens passed via `Authorization: Bearer` header.

### Backend (Express.js)

- **Runtime:** Node.js with TypeScript, compiled via `tsx` for development and `esbuild` for production
- **Server file:** `server/index.ts` — Express app with CORS handling for Replit domains and localhost
- **Routes:** `server/routes.ts` — All API endpoints including auth, deposits, withdrawals, investments, referrals, and admin operations
- **Authentication:** JWT-based auth with two token types (`user` and `admin`). Middleware functions `authMiddleware` and `adminMiddleware` validate tokens. Passwords hashed with `bcryptjs`.
- **Email verification:** OTP-based email verification during registration via `nodemailer`. 6-digit codes with 10-minute expiry, max 3 attempts. Temporary/disposable emails blocked (40+ domains). Falls back to console logging if GMAIL_APP_PASSWORD not set. Code in `server/email.ts`.
- **File uploads:** Screenshot proof of payment uploaded via `multer` to `/uploads` directory. Max 10MB, supports JPG/PNG/GIF/WebP. Upload endpoint at `/api/upload`.
- **Manual investment start:** Deposit approval credits user balance only. User must manually click "Start Investment" on dashboard to begin 72-hour timer. Endpoint: `POST /api/investments/start`.
- **Device enforcement:** One account per device — `deviceId` field checked during registration.
- **Cron jobs:** `node-cron` for processing matured investments (72-hour timer) and auto-paying profits
- **Admin panel:** Server-rendered HTML at `/admin` route (`server/templates/admin.html`) — a single-page vanilla JS app using Tailwind CSS CDN. Features: screenshot viewer for deposits, device ID display for users, email verification status, enhanced audit logging.

### Database

- **Database:** PostgreSQL (via `DATABASE_URL` environment variable)
- **ORM:** Drizzle ORM with `drizzle-zod` for schema validation
- **Schema location:** `shared/schema.ts` — shared between server and client type definitions
- **Tables:**
  - `users` — id (UUID), fullName, email, password, referralCode, referredBy, balance, isBlocked, deviceId, emailVerified, createdAt
  - `deposits` — id, userId, amount, txid, screenshotUrl, status (pending/approved/rejected), createdAt, reviewedAt
  - `investments` — id, userId, depositId, amount, profitRate, startedAt, maturesAt, profitPaid, status
  - `withdrawals` — id, userId, amount, usdtAddress, status, createdAt
  - `referralCommissions` — tracks referral earnings
  - `auditLogs` — admin action audit trail
  - `otpCodes` — email, code, attempts, verified, expiresAt, createdAt (for email OTP verification)
- **Migrations:** Drizzle Kit with `drizzle-kit push` command for schema sync
- **Storage layer:** `server/storage.ts` — data access functions wrapping Drizzle queries

### Build & Deployment

- **Development:** Two processes run concurrently — Expo dev server (`expo:dev`) and Express server (`server:dev`)
- **Production build:** `scripts/build.js` handles static web export from Expo, `server:build` bundles the server with esbuild
- **Production run:** `server:prod` serves the bundled server
- **Environment variables needed:**
  - `DATABASE_URL` — PostgreSQL connection string
  - `EXPO_PUBLIC_DOMAIN` — Domain for API requests from the frontend
  - `SESSION_SECRET` — JWT signing secret (falls back to hardcoded default)
  - `REPLIT_DEV_DOMAIN` / `REPLIT_DOMAINS` — Used for CORS configuration

### Key Design Decisions

1. **Shared schema between client and server** — The `shared/` directory contains Drizzle schema definitions used by both the server for database operations and by the client for TypeScript types. This ensures type consistency.

2. **Manual approval workflow** — All financial operations (deposits, withdrawals) require admin review. No automatic crediting of funds. This is a core security design choice.

3. **Server-side investment timing** — The 72-hour investment timer is enforced server-side via cron jobs, not client-side, to prevent manipulation.

4. **Admin panel as server-rendered HTML** — Rather than a separate SPA build, the admin dashboard is a single HTML file with inline JavaScript, served directly by Express. This simplifies deployment.

5. **Monorepo structure** — Frontend (Expo) and backend (Express) live in the same repository, sharing types through the `shared/` directory.

## External Dependencies

- **PostgreSQL** — Primary database, connected via `DATABASE_URL` environment variable using `pg` driver
- **JWT (jsonwebtoken)** — Token-based authentication for both users and admin
- **bcryptjs** — Password hashing
- **nodemailer** — Email sending for OTP verification (requires GMAIL_APP_PASSWORD secret for production)
- **multer** — File upload handling for deposit screenshots
- **node-cron** — Server-side scheduled tasks for investment maturation
- **Tailwind CSS (CDN)** — Used only in the admin HTML panel, loaded via CDN script tag
- **Expo ecosystem** — expo-router, expo-image-picker, expo-clipboard, expo-haptics, expo-linear-gradient, expo-blur, expo-location, expo-web-browser
- **react-native-qrcode-svg** — QR code generation for the deposit wallet address
- **@tanstack/react-query** — Server state management and caching on the frontend
- **drizzle-orm + drizzle-kit** — Database ORM and migration tooling
- **patch-package** — Applied via postinstall script for patching node_modules