"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, Loader2, Plus } from "lucide-react";
import { Field } from "@/components/auth";
import { Modal } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { VenueBuilder } from "@/components/venue-builder";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type Venue = {
  id: string;
  name: string;
  address: string;
  city: string;
  seatCount: number;
  mine: boolean;
  categories: { id: string; name: string; color: string }[];
};

export default function NewEventPage() {
  const router = useRouter();
  const toast = useToast();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [venueModalOpen, setVenueModalOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    type: "MOVIE" as "MOVIE" | "CONCERT",
    description: "",
    posterUrl: "",
    venueId: "",
    date: "",
    time: "19:30",
    durationMin: 150,
  });
  const [prices, setPrices] = useState<Record<string, string>>({});

  const loadVenues = useCallback(async () => {
    try {
      const d = await api<{ venues: Venue[] }>("/api/venues");
      setVenues(d.venues);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load venues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVenues();
  }, [loadVenues]);

  const venue = useMemo(() => venues.find((v) => v.id === form.venueId), [venues, form.venueId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!venue) {
      setError("Choose a venue (or create your own).");
      return;
    }
    const priceEntries = venue.categories
      .map((c) => ({ categoryId: c.id, priceCents: Math.round(parseFloat(prices[c.id] || "0") * 100) }))
      .filter((p) => Number.isFinite(p.priceCents) && p.priceCents > 0);
    if (priceEntries.length === 0) {
      setError("Set a price for at least one seat category.");
      return;
    }

    setBusy(true);
    try {
      const startsAt = new Date(`${form.date}T${form.time}`);
      const res = await api<{ event: { id: string } }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          description: form.description,
          posterUrl: form.posterUrl || undefined,
          venueId: form.venueId,
          startsAt: startsAt.toISOString(),
          durationMin: form.durationMin,
          prices: priceEntries,
        }),
      });
      toast.success("Event published.");
      router.push(`/organizer/events/${res.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the event.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-500/40 border-t-indigo-400" />
      </div>
    );
  }

  const venueOptions = venues.map((v) => ({
    value: v.id,
    label: `${v.name}${v.mine ? " (yours)" : ""}`,
    hint: `${v.city} - ${v.seatCount} seats`,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/organizer" className="muted inline-flex items-center gap-1.5 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">Create an event</h1>
      <p className="muted mt-1">Pick a venue from the list, or paint the layout of your own venue below.</p>

      <form onSubmit={submit} className="card mt-6 space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <input className="input" required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Interstellar: IMAX Re-release" />
          </Field>
          <Field label="Event type">
            <div className="flex gap-2">
              {(["MOVIE", "CONCERT"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                    form.type === t
                      ? "border-indigo-400/60 bg-indigo-500/15 text-white shadow-glow"
                      : "border-slate-400/20 bg-white/5 text-slate-300 hover:bg-white/10",
                  )}
                >
                  {t === "MOVIE" ? "Movie" : "Concert"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Description">
          <textarea className="input min-h-24" required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell customers what makes this show special..." />
        </Field>

        <div>
          <label className="label">Venue</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Combobox
              className="flex-1"
              value={form.venueId}
              onChange={(v) => setForm({ ...form, venueId: v })}
              placeholder="Search and pick a venue..."
              searchPlaceholder="Search by venue or city..."
              emptyText="No venue matches - create your own below"
              options={venueOptions}
            />
            <button type="button" className="btn-secondary shrink-0" onClick={() => setVenueModalOpen(true)}>
              <Plus className="h-4 w-4" /> My venue isn&apos;t listed
            </button>
          </div>
          {venue && (
            <p className="mt-2 text-xs text-slate-500">
              {venue.name} - {venue.address}, {venue.city} - {venue.seatCount} seats, {venue.categories.length} categories
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <input
              className="input"
              type="date"
              required
              value={form.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Start time">
            <input className="input" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
          <Field label="Duration (minutes)">
            <input
              className="input"
              type="number"
              min={30}
              max={600}
              required
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: parseInt(e.target.value || "120", 10) })}
            />
          </Field>
        </div>

        <Field label="Poster URL (optional)">
          <input className="input" type="url" value={form.posterUrl} onChange={(e) => setForm({ ...form, posterUrl: e.target.value })} placeholder="https://..." />
        </Field>

        {venue && (
          <div>
            <label className="label">Pricing per category - {venue.name}</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {venue.categories.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-400/20 bg-white/5 px-3.5 py-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 truncate text-sm text-slate-200">{c.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      placeholder="0"
                      className="w-20 rounded-lg border border-slate-400/20 bg-night-900/80 px-2 py-1 text-right text-sm text-white focus:border-indigo-400/60 focus:outline-none"
                      value={prices[c.id] ?? ""}
                      onChange={(e) => setPrices({ ...prices, [c.id]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Leave a category at 0 to leave those seats off sale.</p>
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-500/15 pt-4">
          <Link href="/organizer" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn-primary min-w-40" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish event
          </button>
        </div>
      </form>

      {/* Create-your-own-venue modal with the layout painter */}
      <Modal open={venueModalOpen} onClose={() => setVenueModalOpen(false)} wide>
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-white">
                <Building2 className="h-5 w-5 text-indigo-300" /> Create your venue
              </h3>
              <p className="muted mt-1 text-sm">
                Name it, add seat categories (4-6 works well) and drag-paint the layout. It becomes available instantly for your events.
              </p>
            </div>
            <button onClick={() => setVenueModalOpen(false)} className="text-slate-500 hover:text-white" aria-label="Close">
              ✕
            </button>
          </div>
          <VenueBuilder
            mode="create"
            onSaved={async (id) => {
              setVenueModalOpen(false);
              await loadVenues();
              setForm((f) => ({ ...f, venueId: id }));
              toast.success("Venue created and selected.");
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
