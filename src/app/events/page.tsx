"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { EventCard, type EventListItem } from "@/components/event-card";
import { EmptyState, Spinner } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

function EventsBrowser() {
  const params = useSearchParams();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "MOVIE" | "CONCERT">("");
  const [city, setCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (type) sp.set("type", type);
    if (city) sp.set("city", city);
    return sp.toString();
  }, [q, type, city]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ events: EventListItem[] }>(`/api/events${query ? `?${query}` : ""}`);
      setEvents(data.events);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // All cities with venues (not just the ones in the current result set).
  useEffect(() => {
    api<{ cities: string[] }>("/api/events/cities")
      .then((d) => setCities(d.cities))
      .catch(() => setCities([]));
  }, []);

  const initialCity = params.get("city");
  useEffect(() => {
    if (initialCity) setCity(initialCity);
  }, [initialCity]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Browse events</h1>
          <p className="muted mt-1">Live availability for every movie and concert</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-soft" />
          Availability refreshes with every search
        </div>
      </div>

      <div className="card mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events or venues..."
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-400/15 bg-night-900/60 p-1">
          {(
            [
              ["", "All"],
              ["MOVIE", "Movies"],
              ["CONCERT", "Concerts"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setType(val as "" | "MOVIE" | "CONCERT")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
                type === val ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-glow" : "text-slate-300 hover:bg-white/5",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Combobox
          className="sm:w-52"
          value={city}
          onChange={setCity}
          placeholder="All cities"
          searchPlaceholder="Search cities..."
          clearLabel="All cities"
          emptyText="No city matches your search"
          options={cities.map((c) => ({ value: c, label: c }))}
        />
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-8 w-8" />
          </div>
        ) : !events || events.length === 0 ? (
          <EmptyState
            icon={<SlidersHorizontal className="h-6 w-6" />}
            title="No events match your filters"
            hint="Try clearing the search or switching the event type."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <EventsBrowser />
    </Suspense>
  );
}
