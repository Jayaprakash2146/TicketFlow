"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ClipboardList, Loader2, MapPin } from "lucide-react";
import { EmptyState, Spinner, TypeBadge } from "@/components/ui";
import { api } from "@/lib/client";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

type BookingItem = {
  id: string;
  reference: string;
  status: "CONFIRMED" | "CANCELLED";
  totalCents: number;
  bookedAt: string;
  cancelledAt: string | null;
  event: { id: string; title: string; type: "MOVIE" | "CONCERT"; startsAt: string; venue: { name: string; city: string } };
  seats: string[];
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ bookings: BookingItem[] }>("/api/bookings");
      setBookings(data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings");
      setBookings([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!bookings) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const upcoming = bookings.filter((b) => b.status === "CONFIRMED" && new Date(b.event.startsAt) > new Date());
  const rest = bookings.filter((b) => !(b.status === "CONFIRMED" && new Date(b.event.startsAt) > new Date()));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">My bookings</h1>
      <p className="muted mt-1">Tickets, history and cancellations</p>

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      {bookings.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title="No bookings yet"
            hint="Browse events and book your first tickets."
            action={
              <Link href="/events" className="btn-primary btn-sm mt-2">
                Browse events
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {[
            { label: "Upcoming", items: upcoming },
            { label: "Past & cancelled", items: rest },
          ].map((group) =>
            group.items.length > 0 ? (
              <section key={group.label}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">{group.label}</h2>
                <div className="space-y-3">
                  {group.items.map((b) => (
                    <div key={b.id} className="card card-hover flex flex-wrap items-center justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <TypeBadge type={b.event.type} />
                          <span
                            className={cn(
                              "badge",
                              b.status === "CONFIRMED" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
                            )}
                          >
                            {b.status === "CONFIRMED" ? "Confirmed" : "Cancelled"}
                          </span>
                        </div>
                        <Link href={`/events/${b.event.id}`} className="mt-2 block truncate text-base font-bold text-white hover:text-indigo-300">
                          {b.event.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" /> {formatDateTime(b.event.startsAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {b.event.venue.name}
                          </span>
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="text-slate-500">Seats </span>
                          <span className="font-semibold text-slate-200">{b.seats.join(", ")}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-lg font-extrabold text-white">{formatMoney(b.totalCents)}</div>
                        {b.status === "CONFIRMED" ? (
                          <Link href={`/bookings/${b.id}`} className="btn-primary btn-sm">
                            View QR ticket
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-slate-500">{b.reference}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
