import { NextResponse } from "next/server";
import { z } from "zod";
import nodemailer from "nodemailer";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { describeSmtpError, smtpStatus } from "@/lib/email";
import { prisma } from "@/lib/db";

export async function GET() {
  return handle(async () => {
    await requireUser(["ADMIN"]);
    return NextResponse.json(smtpStatus());
  });
}

const schema = z.object({ to: z.string().email() });

/** Sends a real test email and reports the exact SMTP error on failure. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireUser(["ADMIN"]);
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Enter a valid email address to send the test to.");

    if (!smtpStatus().configured) {
      throw new HttpError(
        400,
        "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_FROM) in .env, then restart the dev server.",
      );
    }

    const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;background:#05070f;padding:32px;">
      <div style="max-width:480px;margin:0 auto;background:#0d1322;border:1px solid rgba(148,163,184,.2);border-radius:14px;padding:28px;color:#e2e8f0;">
        <div style="font-size:18px;font-weight:800;color:#fff;">TicketFlow test email</div>
        <p style="color:#94a3b8;line-height:1.6;">Great news - your SMTP settings work. Booking confirmations, waitlist offers and cancellation notices will now be delivered to customer inboxes.</p>
        <p style="color:#64748b;font-size:12px;">Sent ${new Date().toLocaleString()} via ${process.env.SMTP_HOST}</p>
      </div>
    </body></html>`;

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
        to: body.data.to,
        subject: "TicketFlow - SMTP test successful",
        html,
      });
      await prisma.emailLog.create({ data: { to: body.data.to, subject: "TicketFlow - SMTP test successful", html, sent: true } });
      return NextResponse.json({ sent: true });
    } catch (e) {
      const error = describeSmtpError(e);
      await prisma.emailLog
        .create({ data: { to: body.data.to, subject: "TicketFlow - SMTP test successful", html, sent: false, error } })
        .catch(() => undefined);
      throw new HttpError(502, error);
    }
  });
}

export const dynamic = "force-dynamic";
