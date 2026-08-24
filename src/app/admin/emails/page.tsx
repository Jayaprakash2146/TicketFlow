"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Loader2, MailOpen, Send, XCircle } from "lucide-react";
import { EmptyState, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/utils";

type EmailRow = { id: string; to: string; subject: string; sent: boolean; error?: string | null; createdAt: string };
type SmtpStatus = { configured: boolean; host: string | null; user: string | null; from: string | null };

export default function AdminEmailsPage() {
  const toast = useToast();
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [smtp, setSmtp] = useState<SmtpStatus | null>(null);
  const [openHtml, setOpenHtml] = useState<{ subject: string; html: string } | null>(null);
  const [htmlById, setHtmlById] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api<{ emails: EmailRow[] }>("/api/admin/emails"),
        api<SmtpStatus>("/api/admin/smtp").catch(() => null),
      ]);
      setEmails(m.emails);
      setSmtp(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load emails");
      setEmails([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      await api("/api/admin/smtp", { method: "POST", body: JSON.stringify({ to: testTo }) });
      setTestResult({ ok: true, message: `Test email sent to ${testTo}. Check the inbox (and spam folder).` });
      toast.success("Test email sent.");
      void load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test failed";
      setTestResult({ ok: false, message });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  async function open(id: string, subject: string) {
    if (!htmlById[id]) {
      try {
        const res = await fetch(`/api/admin/emails/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const html = await res.text();
        setHtmlById((h) => ({ ...h, [id]: html }));
        setOpenHtml({ subject, html });
      } catch {
        toast.error("Could not open email");
      }
    } else {
      setOpenHtml({ subject, html: htmlById[id] });
    }
  }

  if (!emails) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">System mailbox</h1>
      <p className="muted mt-1">
        Every email the platform produces. Configure SMTP below to deliver them to real inboxes; until then they are
        archived here (with the QR ticket embedded).
      </p>

      {/* SMTP status + test panel */}
      <div className={`card mt-6 p-5 ${smtp?.configured === false ? "border-amber-400/30" : "border-emerald-400/30"}`}>
        <div className="flex items-start gap-3">
          {smtp?.configured ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white">
              {smtp?.configured ? `SMTP configured (${smtp.host})` : "Email delivery is NOT configured"}
            </div>
            {smtp?.configured ? (
              <p className="mt-1 text-xs text-slate-400">
                Sending as <span className="text-slate-200">{smtp.from ?? smtp.user}</span>. Send a test email to verify
                credentials and inbox placement.
              </p>
            ) : (
              <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-400">
                <p>
                  Fill these five values in <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">.env</code>{" "}
                  (file in the project root - not <code className="rounded bg-white/10 px-1.5 py-0.5">.env.example</code>),
                  then restart <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">npm run dev</code>:
                </p>
                <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-emerald-200">{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=TicketFlow <you@gmail.com>`}</pre>
                <p>
                  Gmail requires an <span className="font-semibold text-slate-200">App Password</span> (Google Account -
                  Security - 2-Step Verification - App passwords), not your login password. Brevo/Resend/Mailgun SMTP
                  credentials work the same way.
                </p>
              </div>
            )}

            <form onSubmit={sendTest} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1"
                type="email"
                required
                placeholder="you@example.com - send a test email here"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                disabled={smtp?.configured === false}
              />
              <button type="submit" className="btn-primary shrink-0" disabled={testing || smtp?.configured === false}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send test email
              </button>
            </form>
            {testResult && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                  testResult.ok
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-400/30 bg-rose-500/10 text-rose-200"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {emails.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="No emails yet" hint="Confirm a booking or trigger a waitlist offer to see mail here." />
        </div>
      ) : (
        <div className="card mt-6 divide-y divide-slate-500/10">
          {emails.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <button onClick={() => open(m.id, m.subject)} className="min-w-0 flex-1 text-left transition hover:opacity-80">
                <div className="truncate text-sm font-semibold text-white">{m.subject}</div>
                <div className="truncate text-xs text-slate-500">
                  to {m.to} - {formatDateTime(m.createdAt)}
                  {m.error ? <span className="text-rose-400"> - {m.error}</span> : null}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    m.sent
                      ? "badge bg-emerald-500/10 text-emerald-300"
                      : m.error && m.error.startsWith("SMTP not configured")
                        ? "badge bg-amber-500/10 text-amber-300"
                        : "badge bg-rose-500/10 text-rose-300"
                  }
                  title={m.error ?? undefined}
                >
                  {m.sent ? "sent" : m.error && m.error.startsWith("SMTP not configured") ? "archived" : "failed"}
                </span>
                <button onClick={() => open(m.id, m.subject)} className="text-slate-500 transition hover:text-white" aria-label="Open email">
                  <MailOpen className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!openHtml} onClose={() => setOpenHtml(null)} wide>
        {openHtml && (
          <div>
            <div className="border-b border-slate-500/15 px-5 py-3 text-sm font-bold text-white">{openHtml.subject}</div>
            <iframe title="Email preview" sandbox="" srcDoc={openHtml.html} className="h-[480px] w-full bg-white" />
          </div>
        )}
      </Modal>
    </div>
  );
}
