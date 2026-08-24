"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Armchair, BarChart3, Briefcase, CalendarPlus, IndianRupee } from "lucide-react";
import { EmptyState, Spinner, StatCard, TypeBadge } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDateTime, formatMoney } from "@/lib/utils";

type OrganizerEvent = {
  id: string;
  title: string;
  type: "MOVIE" | "CONCERT";
  startsAt: string;
  venue: { name: string; city: string };
  capacity: number;
  seatsSold: number;
  revenueCents: number;
  minPriceCents: number;
};

type Stats = {
  events: number;
  totalBookings: number;
  totalRevenueCents: number;
  totalSeatsSold: number;
};

export default function OrganizerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<OrganizerEvent[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ stats: Stats; events: OrganizerEvent[] }>("/api/organizer/stats");
      setStats(data.stats);
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-rose-400">{error}</div>;
  if (!stats || !events) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Organizer dashboard</h1>
          <p className="muted mt-1">Your events, bookings and revenue at a glance</p>
        </div>
        <Link href="/organizer/events/new" className="btn-primary">
          <CalendarPlus className="h-4 w-4" /> Create event
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Briefcase className="h-5 w-5" />} label="Upcoming events" value={String(stats.events)} />
        <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Total bookings" value={String(stats.totalBookings)} tone="fuchsia" />
        <StatCard icon={<Armchair className="h-5 w-5" />} label="Seats sold" value={String(stats.totalSeatsSold)} tone="amber" />
        <StatCard icon={<IndianRupee className="h-5 w-5" />} label="Revenue (upcoming)" value={formatMoney(stats.totalRevenueCents)} tone="emerald" />
      </div>

      <h2 className="section-title mt-10 text-xl">Your events</h2>
      {events.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="No events yet"
            hint="Create your first movie or concert listing and start selling tickets."
            action={
              <Link href="/organizer/events/new" className="btn-primary btn-sm mt-2">
                Create event
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-500/15 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5">Event</th>
                <th className="px-4 py-3.5">When</th>
                <th className="px-4 py-3.5">Venue</th>
                <th className="px-4 py-3.5 text-right">Seats sold</th>
                <th className="px-4 py-3.5 text-right">Revenue</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const pct = e.capacity > 0 ? Math.round((e.seatsSold / e.capacity) * 100) : 0;
                return (
                  <tr key={e.id} className="border-b border-slate-500/10 transition hover:bg-white/[0.03]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <TypeBadge type={e.type} />
                        <span className="font-semibold text-white">{e.title}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-400">{formatDateTime(e.startsAt)}</td>
                    <td className="px-4 py-4 text-slate-400">
                      {e.venue.name}
                      <div className="text-xs text-slate-500">{e.venue.city}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-semibold text-white">
                        {e.seatsSold}/{e.capacity}
                      </div>
                      <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-bold text-emerald-300">{formatMoney(e.revenueCents)}</td>
                    <td className="px-4 py-4 text-right">
                      <Link href={`/organizer/events/${e.id}`} className="btn-secondary btn-sm">
                        Summary
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
