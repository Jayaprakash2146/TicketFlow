"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Armchair, ArrowLeft, BarChart3, IndianRupee, Receipt, Users } from "lucide-react";
import { Spinner, StatCard, TypeBadge } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDateTime, formatMoney } from "@/lib/utils";

type EventStats = {
  event: { id: string; title: string; type: "MOVIE" | "CONCERT"; startsAt: string; venue: { name: string; city: string } };
  stats: { capacity: number; seatsSold: number; revenueCents: number; bookings: number };
  categories: { id: string; name: string; color: string; total: number; sold: number; available: number; revenueCents: number }[];
  recentBookings: { id: string; reference: string; customer: string; email: string; seats: string[]; totalCents: number; bookedAt: string }[];
};

export default function EventSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<EventStats | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<EventStats>(`/api/organizer/events/${id}/stats`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the summary");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-rose-400">{error}</div>;
  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const { event, stats, categories, recentBookings } = data;
  const fillPct = stats.capacity > 0 ? Math.round((stats.seatsSold / stats.capacity) * 100) : 0;
  const maxRevenue = Math.max(...categories.map((c) => c.revenueCents), 1);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/organizer" className="muted inline-flex items-center gap-1.5 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={event.type} />
            <Link href={`/events/${event.id}`} className="text-xs font-semibold text-indigo-300 hover:text-indigo-200">
              View public page
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">{event.title}</h1>
          <p className="muted mt-1">
            {formatDateTime(event.startsAt)} - {event.venue.name}, {event.venue.city}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-slate-500">Occupancy</div>
          <div className="text-3xl font-extrabold text-white">{fillPct}%</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Armchair className="h-5 w-5" />} label="Seats sold" value={`${stats.seatsSold}/${stats.capacity}`} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Bookings" value={String(stats.bookings)} tone="fuchsia" />
        <StatCard icon={<IndianRupee className="h-5 w-5" />} label="Revenue" value={formatMoney(stats.revenueCents)} tone="emerald" />
        <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Avg / booking" value={stats.bookings > 0 ? formatMoney(Math.round(stats.revenueCents / stats.bookings)) : "-"} tone="amber" />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="section-title">Revenue by category</h2>
          <div className="mt-5 space-y-4">
            {categories.map((c) => {
              const pct = Math.round((c.revenueCents / maxRevenue) * 100);
              return (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-[4px]" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-bold text-white">{formatMoney(c.revenueCents)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: c.color }} />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {c.sold}/{c.total} sold - {c.available} available
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-300" /> Recent bookings
          </h2>
          {recentBookings.length === 0 ? (
            <p className="muted mt-4">No bookings yet. Numbers refresh every 15 seconds.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-500/15 bg-white/[0.03] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{b.customer}</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {b.email} - {b.seats.join(", ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-300">{formatMoney(b.totalCents)}</div>
                    <div className="font-mono text-[10px] text-slate-500">{b.reference}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
