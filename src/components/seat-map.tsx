"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Armchair,
  BellRing,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  TicketCheck,
  Timer,
  X,
} from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useCountdown } from "@/components/countdown";
import { api, ApiError } from "@/lib/client";
import { cn, formatMoney } from "@/lib/utils";
import type { SessionUser } from "@/lib/jwt";

export type SeatMapData = {
  event: {
    id: string;
    title: string;
    type: "MOVIE" | "CONCERT";
    description: string;
    posterUrl: string | null;
    startsAt: string;
    durationMin: number;
    organizer: string;
    venue: { id: string; name: string; address: string; city: string; seatRows: number; seatCols: number };
  };
  categories: { id: string; name: string; color: string; priceCents: number; total: number; available: number; booked: number; soldOut: boolean }[];
  rows: { label: string; seats: { id: string; number: string; colIndex: number; categoryId: string; status: "AVAILABLE" | "HELD" | "BOOKED" | "OFFERED" }[] }[];
  stats: { totalSeats: number; availableSeats: number };
  soldOut: boolean;
  mine: { holdId: string; expiresAt: string; seatIds: string[] } | null;
  myWaitlist: {
    id: string;
    categoryId: string;
    categoryName: string;
    status: "WAITING" | "OFFERED";
    quantity: number;
    position: number | null;
    offer: { id: string; expiresAt: string } | null;
  }[];
  holdTtlMinutes: number;
  viewer: { id: string; name: string } | null;
};

type Hold = { holdId: string; expiresAt: string; seatIds: string[]; seatLabels: string[] };

const MAX_SELECT = 10;

export function SeatMap({ eventId, initial, user }: { eventId: string; initial: SeatMapData; user: SessionUser | null }) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<SeatMapData>(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<{ bookingId: string; reference: string } | null>(null);
  const [lastSync, setLastSync] = useState<number>(Date.now());
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ smtpConfigured: boolean }>("/api/config")
      .then((c) => setSmtpConfigured(c.smtpConfigured))
      .catch(() => setSmtpConfigured(null));
  }, []);

  const userRef = useRef(user);
  userRef.current = user;
  const holdRef = useRef(hold);
  holdRef.current = hold;

  // ----- live polling -----
  const refetch = useCallback(async () => {
    try {
      const fresh = await api<SeatMapData>(`/api/events/${eventId}/seats`);
      setData(fresh);
      setLastSync(Date.now());
      // Surface an existing hold after refresh/navigation.
      if (!holdRef.current && fresh.mine) {
        setHold({ holdId: fresh.mine.holdId, expiresAt: fresh.mine.expiresAt, seatIds: fresh.mine.seatIds, seatLabels: [] });
      }
    } catch {
      /* transient network errors: keep showing last snapshot */
    }
  }, [eventId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, 4000);
    return () => clearInterval(id);
  }, [refetch]);

  // Adopt a hold already present on load (resume checkout).
  useEffect(() => {
    if (initial.mine) {
      setHold({ holdId: initial.mine.holdId, expiresAt: initial.mine.expiresAt, seatIds: initial.mine.seatIds, seatLabels: [] });
    }
  }, [initial.mine]);

  // ----- helpers -----
  const seatById = useMemo(() => {
    const m = new Map<string, { number: string; categoryId: string; status: string }>();
    for (const row of data.rows) for (const s of row.seats) m.set(s.id, s);
    return m;
  }, [data.rows]);

  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const selectionTotal = useMemo(
    () => selected.reduce((sum, id) => sum + (categoryById.get(seatById.get(id)?.categoryId ?? "")?.priceCents ?? 0), 0),
    [selected, seatById, categoryById],
  );

  function toggleSeat(seat: { id: string; status: string }) {
    if (seat.status !== "AVAILABLE") return;
    setSelected((sel) => {
      if (sel.includes(seat.id)) return sel.filter((s) => s !== seat.id);
      if (sel.length >= MAX_SELECT) {
        toast.info(`You can select up to ${MAX_SELECT} seats per booking.`);
        return sel;
      }
      return [...sel, seat.id];
    });
  }

  // ----- actions -----
  async function placeHold() {
    if (!userRef.current) {
      router.push(`/login?next=/events/${eventId}`);
      return;
    }
    if (selected.length === 0) return;
    setBusy(true);
    try {
      const res = await api<{ holdId: string; expiresAt: string; seatLabels: string[] }>(
        `/api/events/${eventId}/holds`,
        { method: "POST", body: JSON.stringify({ seatIds: selected }) },
      );
      setHold({ ...res, seatIds: selected });
      setSelected([]);
      setCheckoutOpen(true);
      void refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const seats = (e.data.seats as string[] | undefined) ?? [];
        toast.error(seats.length ? `Just taken: ${seats.join(", ")}. Pick other seats.` : "Some seats were just taken by another customer.");
        setSelected([]);
        void refetch();
      } else {
        toast.error(e instanceof Error ? e.message : "Could not hold seats.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function abandonHold() {
    if (!hold) return;
    const holdId = hold.holdId;
    setCheckoutOpen(false);
    setHold(null);
    try {
      await api(`/api/events/${eventId}/holds?holdId=${holdId}`, { method: "DELETE" });
      toast.info("Hold released - the seats are available again.");
    } catch {
      /* lazy TTL will release it anyway */
    }
    void refetch();
  }

  async function confirmBooking() {
    if (!hold) return;
    setBusy(true);
    try {
      const res = await api<{ bookingId: string; reference: string }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ holdId: hold.holdId }),
      });
      setConfirmed(res);
      setHold(null);
      setCheckoutOpen(false);
      toast.success(
        smtpConfigured === false
          ? `Booking ${res.reference} confirmed. Your QR ticket is under My Bookings (email delivery not configured).`
          : `Booking ${res.reference} confirmed - QR ticket emailed to your inbox.`,
      );
      void refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Booking failed.";
      toast.error(msg);
      if (e instanceof ApiError && e.status === 410) {
        setHold(null);
        setCheckoutOpen(false);
        void refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist(categoryId: string, quantity: number) {
    if (!userRef.current) {
      router.push(`/login?next=/events/${eventId}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ position: number }>(`/api/events/${eventId}/waitlist`, {
        method: "POST",
        body: JSON.stringify({ categoryId, quantity }),
      });
      toast.success(`You are #${res.position} in line. We will email you when a seat opens up.`);
      void refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join the waitlist.");
    } finally {
      setBusy(false);
    }
  }

  const soldOutCategories = data.categories.filter((c) => c.soldOut);

  return (
    <div className="space-y-6">
      {/* ------- status bar ------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            <Radio className="h-3.5 w-3.5 animate-pulse-soft" /> Live
          </span>
          <span className="text-xs text-slate-500">
            {data.stats.availableSeats} of {data.stats.totalSeats} seats free - updated {Math.max(0, Math.round((Date.now() - lastSync) / 1000))}s ago
          </span>
          <button onClick={() => void refetch()} className="text-slate-500 transition hover:text-white" aria-label="Refresh seat map">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <LegendSwatch className="bg-slate-600/70" label="Available" />
          <LegendSwatch className="bg-amber-400/80" label="On hold" />
          <LegendSwatch className="bg-violet-400/80" label="Waitlist offer" />
          <LegendSwatch className="bg-slate-800 ring-1 ring-slate-700" label="Booked" />
        </div>
      </div>

      {/* ------- resume hold banner ------- */}
      {hold && !checkoutOpen && !confirmed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-200">
            <Clock3 className="h-4 w-4" />
            You have seats on hold - <HoldCountdown expiresAt={hold.expiresAt} /> left to complete checkout.
          </div>
          <button className="btn-primary btn-sm" onClick={() => setCheckoutOpen(true)}>
            Resume checkout
          </button>
        </div>
      )}

      {/* ------- confirmed banner ------- */}
      {confirmed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-200">
            <TicketCheck className="h-4 w-4" />
            {smtpConfigured === false ? (
              <>
                Booking <span className="font-mono font-bold">{confirmed.reference}</span> confirmed. Email delivery (SMTP) is not
                configured on this deployment - your QR ticket lives safely under My Bookings.
              </>
            ) : (
              <>
                Booking <span className="font-mono font-bold">{confirmed.reference}</span> confirmed. Check your email for the QR ticket.
              </>
            )}
          </div>
          <Link href={`/bookings/${confirmed.bookingId}`} className="btn-primary btn-sm">
            View ticket
          </Link>
        </div>
      )}

      {/* ------- my waitlist ------- */}
      {data.myWaitlist.length > 0 && (
        <div className="space-y-2">
          {data.myWaitlist.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-indigo-200">
                <BellRing className="h-4 w-4" />
                Waitlist - {w.categoryName} ({w.quantity} {w.quantity > 1 ? "seats" : "seat"})
                {w.status === "WAITING" && w.position && <span className="text-slate-400">- position #{w.position}</span>}
                {w.status === "OFFERED" && <span className="font-semibold text-amber-300">- you have an offer!</span>}
              </div>
              {w.offer && (
                <Link href={`/offers/${w.offer.id}`} className="btn-primary btn-sm">
                  Open offer <Timer className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ------- seat grid ------- */}
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {data.categories.map((c) => (
            <span key={c.id} className="badge border border-slate-500/20 bg-white/5 py-1 pl-1.5 pr-2.5 text-slate-300">
              <span className="mr-1 h-2.5 w-2.5 rounded-[4px]" style={{ backgroundColor: c.color }} />
              {c.name} - {formatMoney(c.priceCents)}
              <span className="text-slate-500">({c.available} left)</span>
            </span>
          ))}
        </div>

        <div className="mb-5 flex justify-center">
          <div className="relative w-2/3 max-w-md">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
            <div className="mt-1.5 text-center text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">
              {data.event.type === "MOVIE" ? "Screen" : "Stage"}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="mx-auto w-max">
            {data.rows.map((row) => (
              <div key={row.label} className="mb-1.5 flex items-center gap-2">
                <span className="w-5 text-right text-[10px] font-bold text-slate-500">{row.label}</span>
                <div className="flex gap-1.5">
                  {Array.from({ length: data.event.venue.seatCols }).map((_, col) => {
                    const seat = row.seats.find((s) => s.colIndex === col);
                    if (!seat) return <span key={col} className="h-7 w-7 sm:h-8 sm:w-8" />;
                    return <SeatButton key={seat.id} seat={seat} category={categoryById.get(seat.categoryId)} selected={selected.includes(seat.id)} onClick={() => toggleSeat(seat)} />;
                  })}
                </div>
                <span className="w-5 text-[10px] font-bold text-slate-500">{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------- waitlist join (sold out categories) ------- */}
      {soldOutCategories.length > 0 && (
        <div className="card p-5">
          <div className="section-title flex items-center gap-2">
            <BellRing className="h-5 w-5 text-indigo-300" /> Sold out - join the waitlist
          </div>
          <p className="muted mt-1">If a customer cancels, seats are offered to the queue in order. You get an email with a time-limited link.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {soldOutCategories.map((c) => (
              <WaitlistJoinCard key={c.id} category={c} joined={data.myWaitlist.some((w) => w.categoryId === c.id)} busy={busy} onJoin={joinWaitlist} />
            ))}
          </div>
        </div>
      )}

      {/* ------- selection bar ------- */}
      <div className="sticky bottom-4 z-30">
        <div className={cn("card flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-all", selected.length > 0 && "border-indigo-400/40 shadow-glow")}>
          <div className="flex min-h-8 flex-wrap items-center gap-1.5">
            {selected.length === 0 ? (
              <span className="text-sm text-slate-400">Tap seats on the map to select them (max {MAX_SELECT})</span>
            ) : (
              selected.map((id) => {
                const seat = seatById.get(id);
                const cat = categoryById.get(seat?.categoryId ?? "");
                return (
                  <button
                    key={id}
                    onClick={() => toggleSeat({ id, status: "AVAILABLE" })}
                    className="badge border border-slate-400/25 bg-white/5 px-2 py-1 text-slate-200 hover:border-rose-400/50 hover:text-rose-300"
                    title="Remove"
                  >
                    {seat?.number} <X className="h-3 w-3" />
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-4">
            {selected.length > 0 && (
              <div className="text-sm">
                <span className="muted">{selected.length} {selected.length === 1 ? "seat" : "seats"} - </span>
                <span className="text-lg font-extrabold text-white">{formatMoney(selectionTotal)}</span>
              </div>
            )}
            <button onClick={placeHold} disabled={selected.length === 0 || busy} className="btn-primary min-w-[180px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {user ? "Hold & checkout" : "Sign in to book"}
            </button>
          </div>
        </div>
      </div>

      {/* ------- checkout modal ------- */}
      <CheckoutModal
        key={hold?.holdId ?? "none"}
        open={checkoutOpen}
        hold={hold}
        data={data}
        busy={busy}
        countdownKey={hold?.holdId ?? "none"}
        onConfirm={confirmBooking}
        onAbandon={abandonHold}
        onClosed={() => setCheckoutOpen(false)}
      />
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-[4px]", className)} />
      {label}
    </span>
  );
}

function SeatButton({
  seat,
  category,
  selected,
  onClick,
}: {
  seat: { id: string; number: string; status: string; categoryId: string };
  category?: { color: string; name: string; priceCents: number };
  selected: boolean;
  onClick: () => void;
}) {
  const base = "seat-btn";
  if (seat.status === "BOOKED") {
    return (
      <span className={cn(base, "bg-slate-800/90 ring-1 ring-slate-700")} title={`${seat.number} - booked`}>
        <X className="h-3 w-3 text-slate-600" />
      </span>
    );
  }
  if (seat.status === "HELD") {
    return (
      <span className={cn(base, "bg-amber-400/25 ring-1 ring-amber-400/50")} title={`${seat.number} - on hold by another customer`}>
        <Clock3 className="h-3 w-3 text-amber-300/80" />
      </span>
    );
  }
  if (seat.status === "OFFERED") {
    return (
      <span className={cn(base, "bg-violet-400/30 ring-1 ring-violet-400/60")} title={`${seat.number} - offered to a waitlisted customer`}>
        <BellRing className="h-3 w-3 text-violet-300" />
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Seat ${seat.number}${category ? `, ${category.name}, ${formatMoney(category.priceCents)}` : ""}`}
      title={`${seat.number} - ${category?.name ?? ""} - ${category ? formatMoney(category.priceCents) : ""}`}
      className={cn(base, selected && "scale-110 ring-2 ring-white brightness-125")}
      style={{ backgroundColor: category ? category.color + "b3" : "#64748bb3" }}
    >
      <Armchair className="h-3.5 w-3.5 text-black/40 opacity-0 transition-opacity group-hover:opacity-40" />
    </button>
  );
}

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const c = useCountdown(expiresAt);
  return <span className="font-mono font-bold">{c.label}</span>;
}

function WaitlistJoinCard({
  category,
  joined,
  busy,
  onJoin,
}: {
  category: { id: string; name: string; color: string; priceCents: number };
  joined: boolean;
  busy: boolean;
  onJoin: (categoryId: string, quantity: number) => void;
}) {
  const [qty, setQty] = useState(1);
  if (joined) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        You are on this waitlist. We will email you the moment a seat opens up.
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-500/20 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: category.color }} />
        <div>
          <div className="text-sm font-semibold text-white">{category.name}</div>
          <div className="text-xs text-slate-500">{formatMoney(category.priceCents)} per seat</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-slate-400/20">
          <button className="px-2 py-1.5 text-slate-300 hover:text-white disabled:opacity-40" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)} aria-label="Fewer seats">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-bold text-white">{qty}</span>
          <button className="px-2 py-1.5 text-slate-300 hover:text-white disabled:opacity-40" disabled={qty >= 6} onClick={() => setQty((q) => q + 1)} aria-label="More seats">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => onJoin(category.id, qty)}>
          Join waitlist
        </button>
      </div>
    </div>
  );
}

function CheckoutModal({
  open,
  hold,
  data,
  busy,
  countdownKey,
  onConfirm,
  onAbandon,
  onClosed,
}: {
  open: boolean;
  hold: Hold | null;
  data: SeatMapData;
  busy: boolean;
  countdownKey: string;
  onConfirm: () => void;
  onAbandon: () => void;
  onClosed: () => void;
}) {
  const c = useCountdown(hold?.expiresAt ?? null, undefined, 250);

  const seatLabels = useMemo(() => {
    if (!hold) return [];
    const m = new Map<string, string>();
    for (const row of data.rows) for (const s of row.seats) m.set(s.id, s.number);
    return hold.seatIds.map((id) => m.get(id) ?? id).sort();
  }, [hold, data.rows]);

  const total = useMemo(() => {
    if (!hold) return 0;
    const m = new Map<string, string>();
    for (const row of data.rows) for (const s of row.seats) m.set(s.id, s.categoryId);
    return hold.seatIds.reduce((sum, id) => sum + (data.categories.find((cat) => cat.id === m.get(id))?.priceCents ?? 0), 0);
  }, [hold, data]);

  const expired = c.expired;

  return (
    <Modal open={open} onClose={onClosed} wide>
      {hold && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-extrabold text-white">Complete your booking</h3>
              <p className="muted mt-0.5">{data.event.title}</p>
            </div>
            <button onClick={onClosed} className="text-slate-500 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* countdown */}
          <div className="mt-5 rounded-xl border border-slate-500/20 bg-night-900/70 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <Timer className="h-4 w-4 text-amber-300" />
                {expired ? "Hold expired" : `Seats held for you - ${c.label} remaining`}
              </span>
              <span className={cn("font-mono text-lg font-extrabold", expired ? "text-rose-400" : c.secondsLeft < 120 ? "text-rose-300" : "text-white")}>
                {c.label}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div key={countdownKey} className="timer-track h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(c.pct * 100, 0)}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              If you leave this page or the timer runs out, the seats are released automatically and shown to other customers.
            </p>
          </div>

          {/* summary */}
          <div className="mt-5 space-y-3 rounded-xl border border-slate-500/20 bg-white/5 p-4 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Seats ({seatLabels.length})</span>
              <span className="font-semibold text-white">{seatLabels.join(", ")}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>When</span>
              <span className="text-slate-200">{new Date(data.event.startsAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Where</span>
              <span className="text-slate-200">{data.event.venue.name}, {data.event.venue.city}</span>
            </div>
            <div className="flex justify-between border-t border-slate-500/15 pt-3 text-base">
              <span className="font-semibold text-slate-200">Total</span>
              <span className="font-extrabold text-white">{formatMoney(total)}</span>
            </div>
          </div>

          {expired ? (
            <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-5 text-center">
              <Clock3 className="h-7 w-7 text-rose-300" />
              <div className="text-sm text-rose-200">
                Your hold expired and the seats were released. You can select seats again on the map.
              </div>
              <button className="btn-secondary btn-sm" onClick={onClosed}>
                Back to seat map
              </button>
            </div>
          ) : (
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-ghost" onClick={onAbandon} disabled={busy}>
                Abandon - release seats
              </button>
              <button className="btn-primary min-w-56" onClick={onConfirm} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Pay {formatMoney(total)} & confirm
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function SeatMapFallback() {
  return (
    <div className="card flex items-center justify-center p-20">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
