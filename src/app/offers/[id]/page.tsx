"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlarmClock, Armchair, CalendarDays, CheckCircle2, Loader2, MapPin, PartyPopper, TicketCheck } from "lucide-react";
import { Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCountdown } from "@/components/countdown";
import { api, ApiError } from "@/lib/client";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

type OfferData = {
  offer: {
    id: string;
    status: "ACTIVE" | "ACCEPTED" | "EXPIRED";
    expired: boolean;
    expiresAt: string;
    acceptedBookingId: string | null;
    mine: boolean;
    event: { id: string; title: string; type: "MOVIE" | "CONCERT"; startsAt: string; venue: { name: string; city: string } };
    categoryName: string;
    seats: string[];
    totalCents: number;
  };
  offerTtlMinutes: number;
};

export default function OfferPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<OfferData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<{ bookingId: string; reference: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<OfferData>(`/api/offers/${id}`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this offer.");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function accept() {
    setBusy(true);
    try {
      const res = await api<{ bookingId: string; reference: string }>(`/api/offers/${id}/accept`, { method: "POST" });
      setAccepted(res);
      toast.success("Offer accepted - your QR ticket is on its way to your inbox.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept this offer.");
      if (e instanceof ApiError && e.status === 410) await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-slate-400">{error}</p>
        <Link href="/events" className="btn-secondary btn-sm mt-4">
          Browse events
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const { offer } = data;

  if (accepted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="card p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <PartyPopper className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-white">You are going!</h1>
          <p className="muted mt-2">
            Booking <span className="font-mono font-bold text-slate-200">{accepted.reference}</span> confirmed for {offer.event.title}.
            Your QR ticket has been emailed to you.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href={`/bookings/${accepted.bookingId}`} className="btn-primary">
              <TicketCheck className="h-4 w-4" /> View ticket
            </Link>
            <Link href="/events" className="btn-secondary">
              Browse events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600/40 to-fuchsia-600/30 px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-bold text-violet-100">
            <AlarmClock className="h-5 w-5" /> Waitlist offer
          </div>
          <h1 className="mt-2 text-xl font-extrabold text-white">{offer.event.title}</h1>
          <div className="mt-1 text-sm text-violet-100/80">
            {formatDateTime(offer.event.startsAt)} - {offer.event.venue.name}, {offer.event.venue.city}
          </div>
        </div>

        <div className="px-6 py-5">
          {!offer.mine ? (
            <div className="rounded-xl border border-slate-500/25 bg-white/5 p-6 text-center text-sm text-slate-300">
              This waitlist offer belongs to another customer.
              <div className="mt-4">
                <Link href="/events" className="btn-secondary btn-sm">
                  Browse events
                </Link>
              </div>
            </div>
          ) : offer.expired || offer.status !== "ACTIVE" ? (
            <ExpiredPanel />
          ) : (
            <ActivePanel key={offer.id} offer={offer} ttl={data.offerTtlMinutes} busy={busy} onAccept={accept} />
          )}
        </div>
      </div>
    </div>
  );
}

function ActivePanel({
  offer,
  ttl,
  busy,
  onAccept,
}: {
  offer: OfferData["offer"];
  ttl: number;
  busy: boolean;
  onAccept: () => void;
}) {
  const c = useCountdown(offer.expiresAt, ttl * 60_000, 250);
  const expired = c.expired;

  return (
    <>
      <div className="rounded-xl border border-slate-500/20 bg-night-900/70 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-300">{expired ? "Offer expired" : "Confirm within"}</span>
          <span className={cn("font-mono text-2xl font-extrabold", expired ? "text-rose-400" : c.secondsLeft < 120 ? "text-rose-300" : "text-white")}>
            {c.label}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="timer-track h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(c.pct * 100, 0)}%` }} />
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between text-slate-400">
          <span>Category</span>
          <span className="font-semibold text-white">{offer.categoryName}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <Armchair className="h-4 w-4" /> Seats offered
          </span>
          <span className="font-semibold text-white">{offer.seats.join(", ")}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" /> Showtime
          </span>
          <span className="text-slate-200">{formatDateTime(offer.event.startsAt)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-500/15 pt-3 text-base">
          <span className="font-semibold text-slate-200">Total</span>
          <span className="font-extrabold text-white">{formatMoney(offer.totalCents)}</span>
        </div>
      </div>

      {expired ? (
        <ExpiredPanel />
      ) : (
        <>
          <button className="btn-primary mt-6 w-full py-3" onClick={onAccept} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Accept offer & book {formatMoney(offer.totalCents)}
          </button>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            If the timer runs out, these seats are automatically offered to the next customer on the waitlist.
          </p>
        </>
      )}
    </>
  );
}

function ExpiredPanel() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-8 text-center">
      <AlarmClock className="h-9 w-9 text-rose-300" />
      <div className="text-base font-bold text-white">This offer has expired</div>
      <p className="text-sm leading-relaxed text-slate-400">
        The seats have been offered to the next customer in line. You can rejoin the waitlist from the event page
        if it is still sold out.
      </p>
      <Link href="/events" className="btn-secondary btn-sm mt-1">
        Browse events
      </Link>
    </div>
  );
}
