"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, Clock3, Download, Loader2, MapPin, ScanLine, TicketCheck, XCircle } from "lucide-react";
import { Modal, Spinner, TypeBadge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { formatDateTime, formatMoney } from "@/lib/utils";

type BookingDetail = {
  id: string;
  reference: string;
  status: "CONFIRMED" | "CANCELLED";
  totalCents: number;
  bookedAt: string;
  cancelledAt: string | null;
  event: {
    id: string;
    title: string;
    type: "MOVIE" | "CONCERT";
    startsAt: string;
    durationMin: number;
    venue: { name: string; city: string; address: string };
    organizer: { name: string };
  };
  seats: { number: string; category: string }[];
  qr: string;
};

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: { smtpConfigured: boolean }) => setSmtpConfigured(c.smtpConfigured))
      .catch(() => setSmtpConfigured(null));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<{ booking: BookingDetail }>(`/api/bookings/${id}`);
      setBooking(data.booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load booking");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/bookings/${id}/cancel`, { method: "POST" });
      toast.success("Booking cancelled. The seats were offered to the waitlist.");
      setConfirmOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancellation failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-slate-400">{error}</p>
        <Link href="/bookings" className="btn-secondary btn-sm mt-4">
          Back to bookings
        </Link>
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const cancelled = booking.status === "CANCELLED";
  const upcoming = new Date(booking.event.startsAt) > new Date();

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/bookings" className="muted text-sm hover:text-white">
        &larr; All bookings
      </Link>

      {/* boarding-pass style ticket */}
      <div className="card mt-4 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600/40 to-fuchsia-600/30 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <TicketCheck className="h-5 w-5" /> TicketFlow
            </div>
            <TypeBadge type={booking.event.type} />
          </div>
          <div className="mt-2 text-xl font-extrabold text-white">{booking.event.title}</div>
          <div className="text-sm text-indigo-100/80">presented by {booking.event.organizer.name}</div>
        </div>

        <div className="grid gap-4 px-6 py-5 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <CalendarDays className="mt-0.5 h-4 w-4 text-indigo-300" />
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">When</div>
              <div className="font-semibold text-slate-200">{formatDateTime(booking.event.startsAt)}</div>
              <div className="text-xs text-slate-500">{booking.event.durationMin} minutes</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 text-indigo-300" />
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Where</div>
              <div className="font-semibold text-slate-200">{booking.event.venue.name}</div>
              <div className="text-xs text-slate-500">{booking.event.venue.address}, {booking.event.venue.city}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-slate-500/25 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Seats</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {booking.seats.map((s) => (
                  <span key={s.number} className="badge border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-indigo-200">
                    {s.number} <span className="text-indigo-300/60">- {s.category}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs uppercase tracking-wider text-slate-500">Total paid</div>
              <div className="text-lg font-extrabold text-emerald-300">{formatMoney(booking.totalCents)}</div>
            </div>
            <div className="flex flex-col items-center">
              {cancelled || !booking.qr ? (
                <div className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/5 text-center">
                  <XCircle className="h-8 w-8 text-rose-400/70" />
                  <div className="px-3 text-xs text-rose-300">{cancelled ? "Cancelled - QR void" : "QR unavailable"}</div>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={booking.qr} alt={`QR code for booking ${booking.reference}`} className="h-40 w-40 rounded-xl border-4 border-white bg-white" />
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">
                    <ScanLine className="h-3 w-3" /> scan at the gate
                  </div>
                  <a href={booking.qr} download={`ticket-${booking.reference}.png`} className="btn-secondary btn-sm mt-1.5">
                    <Download className="h-3.5 w-3.5" /> Download QR
                  </a>
                </>
              )}
              <div className="mt-1.5 font-mono text-base font-extrabold tracking-[0.2em] text-white">{booking.reference}</div>
              {smtpConfigured === false && (
                <p className="mt-2 max-w-40 text-center text-[10px] leading-relaxed text-amber-300/80">
                  Email delivery (SMTP) is not configured on this deployment, so the ticket email is archived in the admin
                  mailbox instead. Download your QR here anytime.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-500/15 px-6 py-4">
          <span className="text-xs text-slate-500">
            {cancelled
              ? `Cancelled on ${booking.cancelledAt ? formatDateTime(booking.cancelledAt) : "-"}`
              : `Booked on ${formatDateTime(booking.bookedAt)}`}
          </span>
          {!cancelled && upcoming && (
            <button className="btn-danger btn-sm" onClick={() => setConfirmOpen(true)}>
              <Clock3 className="h-3.5 w-3.5" /> Cancel booking
            </button>
          )}
        </div>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-white">Cancel this booking?</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Your {booking.seats.length} {booking.seats.length === 1 ? "seat" : "seats"} ({booking.seats.map((s) => s.number).join(", ")}) will be
            released. If there is a waitlist for this event, the seats are offered straight to the next customer in line.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Keep booking
            </button>
            <button className="btn-danger" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel booking
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
