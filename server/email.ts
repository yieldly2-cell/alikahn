import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER || "yieldly@gmail.com";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";

const BLOCKED_DOMAINS = [
  "temp-mail.org", "10minutemail.com", "guerrillamail.com", "mailinator.com",
  "throwaway.email", "tempail.com", "fakeinbox.com", "sharklasers.com",
  "guerrillamailblock.com", "grr.la", "guerrillamail.info", "guerrillamail.net",
  "guerrillamail.de", "yopmail.com", "yopmail.fr", "trashmail.com", "trashmail.net",
  "trashmail.me", "dispostable.com", "mailnesia.com", "tempinbox.com",
  "maildrop.cc", "mailnull.com", "spamgourmet.com", "harakirimail.com",
  "tempmail.ninja", "getnada.com", "emailondeck.com", "mohmal.com",
  "discard.email", "33mail.com", "mailcatch.com", "tempr.email",
  "temp-mail.io", "tempmailo.com", "minutemail.com", "emailfake.com",
  "burnermail.io", "inboxbear.com", "mytemp.email", "mt2015.com",
  "sharklasers.com", "tmail.ws", "tmpmail.net", "tmpmail.org",
  "boun.cr", "mailexpire.com", "throwam.com", "jetable.org",
];

export function isTemporaryEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return true;
  return BLOCKED_DOMAINS.includes(domain);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTPEmail(email: string, code: string): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD) {
    console.warn("GMAIL_APP_PASSWORD not set - OTP email will be logged to console");
    console.log(`[OTP] Code for ${email}: ${code}`);
    return true;
  }

  try {
    const mailTransporter = getTransporter();
    await mailTransporter.sendMail({
      from: `"Yieldly" <${GMAIL_USER}>`,
      to: email,
      subject: "Your Yieldly Verification Code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0A0A0A;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#10B981;font-size:28px;margin:0;">Yieldly</h1>
            <p style="color:#9CA3AF;font-size:14px;margin-top:4px;">Secure USDT Investment Platform</p>
          </div>
          <div style="background:#1E1E1E;border-radius:8px;padding:24px;text-align:center;">
            <p style="color:#D1D5DB;font-size:14px;margin:0 0 16px 0;">Your verification code is:</p>
            <div style="background:#2A2A2A;border-radius:8px;padding:16px;display:inline-block;letter-spacing:8px;">
              <span style="color:#10B981;font-size:32px;font-weight:700;">${code}</span>
            </div>
            <p style="color:#6B7280;font-size:12px;margin:16px 0 0 0;">This code expires in 10 minutes. Do not share it with anyone.</p>
          </div>
          <p style="color:#4B5563;font-size:11px;text-align:center;margin-top:24px;">
            If you did not request this code, please ignore this email.
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("Failed to send OTP email:", err);
    return false;
  }
}
