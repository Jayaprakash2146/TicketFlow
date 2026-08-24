import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { APP_URL, OFFER_TTL_MINUTES } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/utils";

type MailInput = {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; cid: string }[];
};

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Sends via SMTP when configured. Always stores the email in EmailLog
 * (with QR embedded as a data-URI) so it can be inspected at /admin/emails
 * even without an SMTP account. Delivery failures store the exact SMTP
 * error for diagnosis.
 */
async function sendMail({ to, subject, html, attachments }: MailInput): Promise<{ sent: boolean; error?: string }> {
  let sent = false;
  let error: string | undefined;

  if (smtpConfigured()) {
    try {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? "587", 10),
        secure: parseInt(process.env.SMTP_PORT ?? "587", 10) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? `TicketFlow <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        attachments,
      });
      sent = true;
    } catch (e) {
      error = describeSmtpError(e);
      console.error("[email] SMTP delivery failed:", error);
    }
  } else {
    error = "SMTP not configured - set SMTP_HOST, SMTP_USER and SMTP_PASS in .env";
    console.log(`[email:dev] To: ${to} | Subject: ${subject}`);
  }

  // Store a self-contained version (data-URI QR) for the dev mailbox.
  const logHtml = attachments?.length
    ? html.replace(/cid:qrcode/g, `data:image/png;base64,${attachments[0].content.toString("base64")}`)
    : html;

  await prisma.emailLog
    .create({ data: { to, subject, html: logHtml, sent, error } })
    .catch(() => undefined);

  return { sent, error };
}

/** Turns raw nodemailer/network errors into an actionable message. */
export function describeSmtpError(e: unknown): string {
  const raw = e instanceof Error ? `${e.message}` : String(e);
  const code = (e as { code?: string })?.code;
  if (code === "EAUTH" || /Invalid login|authentication|535|Username and Password not accepted/i.test(raw)) {
    return "Authentication failed (EAUTH). For Gmail you must use a 16-character App Password (not your normal password). Check SMTP_USER / SMTP_PASS.";
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || /timeout/i.test(raw)) {
    return "Connection timed out. Check SMTP_HOST and SMTP_PORT (587 with STARTTLS, or 465 with SSL), and that your network/firewall allows outbound SMTP.";
  }
  if (code === "EDNS" || /getaddrinfo|ENOTFOUND/i.test(raw)) {
    return "SMTP host not found. Check SMTP_HOST spelling (e.g. smtp.gmail.com).";
  }
  if (code === "ECONNECTION" || /ECONNREFUSED/i.test(raw)) {
    return "Connection refused. The host is reachable but rejected the port - check SMTP_PORT.";
  }
  if (/Missing credentials/i.test(raw)) {
    return "SMTP_USER or SMTP_PASS is empty in .env.";
  }
  return raw;
}

export function smtpStatus(): { configured: boolean; host: string | null; from: string | null; user: string | null } {
  return {
    configured: smtpConfigured(),
    host: process.env.SMTP_HOST || null,
    user: process.env.SMTP_USER || null,
    from: process.env.SMTP_FROM || null,
  };
}

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#05070f;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070f;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0d1322;border:1px solid rgba(148,163,184,.18);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:20px 28px;background:linear-gradient(135deg,#4f46e5,#c026d3);">
          <span style="font-size:18px;font-weight:700;color:#fff;letter-spacing:.5px;">TicketFlow</span>
        </td></tr>
        <tr><td style="padding:28px;color:#e2e8f0;font-size:14px;line-height:1.65;">${inner}</td></tr>
        <tr><td style="padding:16px 28px 24px;color:#64748b;font-size:11px;border-top:1px solid rgba(148,163,184,.12);">
          You received this email because of activity on your TicketFlow account.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

type BookingEmailData = {
  to: string;
  name: string;
  reference: string;
  eventTitle: string;
  eventStartsAt: Date;
  venue: string;
  city: string;
  seats: string[];
  totalCents: number;
  qr: string; // data URI
};

export async function sendBookingConfirmationEmail(d: BookingEmailData) {
  const html = shell(`
    <h2 style="margin:0 0 4px;color:#fff;font-size:20px;">Booking confirmed</h2>
    <p style="margin:0 0 20px;color:#94a3b8;">Hi ${escapeHtml(d.name)}, your tickets are locked in.</p>
    <div style="background:#111a2e;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="font-size:17px;font-weight:700;color:#fff;">${escapeHtml(d.eventTitle)}</div>
      <div style="color:#94a3b8;margin-top:4px;">${escapeHtml(formatDateTime(d.eventStartsAt))} &middot; ${escapeHtml(d.venue)}, ${escapeHtml(d.city)}</div>
      <div style="margin-top:12px;color:#94a3b8;">Seats</div>
      <div style="color:#e2e8f0;font-weight:600;">${d.seats.map(escapeHtml).join(", ")}</div>
      <div style="margin-top:12px;color:#94a3b8;">Amount paid</div>
      <div style="color:#34d399;font-weight:700;font-size:16px;">${formatMoney(d.totalCents)}</div>
    </div>
    <div style="text-align:center;margin:8px 0 20px;">
      <img src="cid:qrcode" width="180" height="180" alt="QR ticket" style="border-radius:12px;border:6px solid #fff;" />
      <div style="margin-top:10px;font-size:13px;color:#94a3b8;">Booking reference</div>
      <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:2px;">${escapeHtml(d.reference)}</div>
    </div>
    <p style="color:#64748b;font-size:12px;">Show this QR code at the venue gate. You can also view it anytime under My Bookings.</p>
  `);
  await sendMail({
    to: d.to,
    subject: `Your tickets for ${d.eventTitle} (${d.reference})`,
    html,
    attachments: [
      {
        filename: "ticket.png",
        content: Buffer.from(d.qr.split(",")[1], "base64"),
        cid: "qrcode",
      },
    ],
  });
}

type OfferEmailData = {
  to: string;
  name: string;
  eventTitle: string;
  categoryName: string;
  seatLabels: string[];
  priceCents: number;
  offerId: string;
  expiresAt: Date;
};

export async function sendWaitlistOfferEmail(d: OfferEmailData) {
  const link = `${APP_URL}/offers/${d.offerId}`;
  const html = shell(`
    <h2 style="margin:0 0 4px;color:#fff;font-size:20px;">A seat just opened up</h2>
    <p style="margin:0 0 20px;color:#94a3b8;">Hi ${escapeHtml(d.name)}, you are next on the waitlist.</p>
    <div style="background:#111a2e;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="font-size:17px;font-weight:700;color:#fff;">${escapeHtml(d.eventTitle)}</div>
      <div style="margin-top:8px;color:#94a3b8;">Category</div>
      <div style="color:#e2e8f0;font-weight:600;">${escapeHtml(d.categoryName)}</div>
      <div style="margin-top:8px;color:#94a3b8;">Seats offered</div>
      <div style="color:#e2e8f0;font-weight:600;">${d.seatLabels.map(escapeHtml).join(", ")}</div>
      <div style="margin-top:8px;color:#94a3b8;">Total</div>
      <div style="color:#34d399;font-weight:700;">${formatMoney(d.priceCents)}</div>
    </div>
    <p style="color:#fbbf24;font-weight:600;">This offer expires ${escapeHtml(formatDateTime(d.expiresAt))} (${OFFER_TTL_MINUTES} minutes).</p>
    <a href="${link}" style="display:inline-block;margin:8px 0 16px;background:linear-gradient(135deg,#4f46e5,#c026d3);color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:10px;">Confirm my booking</a>
    <p style="color:#64748b;font-size:12px;">If you do not complete the booking before the deadline, the seats will be offered to the next customer in line.</p>
  `);
  await sendMail({ to: d.to, subject: `Waitlist offer: seats for ${d.eventTitle}`, html });
}

type CancellationData = {
  to: string;
  name: string;
  eventTitle: string;
  seats: string[];
  refundCents: number;
};

export async function sendCancellationEmail(d: CancellationData) {
  const html = shell(`
    <h2 style="margin:0 0 4px;color:#fff;font-size:20px;">Booking cancelled</h2>
    <p style="margin:0 0 20px;color:#94a3b8;">Hi ${escapeHtml(d.name)}, your booking has been cancelled.</p>
    <div style="background:#111a2e;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:16px;">
      <div style="font-size:17px;font-weight:700;color:#fff;">${escapeHtml(d.eventTitle)}</div>
      <div style="margin-top:8px;color:#94a3b8;">Seats released</div>
      <div style="color:#e2e8f0;font-weight:600;">${d.seats.map(escapeHtml).join(", ")}</div>
      <div style="margin-top:8px;color:#94a3b8;">Refunded</div>
      <div style="color:#34d399;font-weight:700;">${formatMoney(d.refundCents)}</div>
    </div>
  `);
  await sendMail({ to: d.to, subject: `Booking cancelled: ${d.eventTitle}`, html });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
