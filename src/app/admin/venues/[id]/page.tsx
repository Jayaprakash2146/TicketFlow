"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { VenueBuilder, type VenueBuilderData } from "@/components/venue-builder";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client";

type VenueFull = {
  id: string;
  name: string;
  address: string;
  city: string;
  seatRows: number;
  seatCols: number;
  eventCount: number;
  categories: { id: string; name: string; color: string }[];
  seats: { rowIndex: number; colIndex: number; categoryId: string }[];
};

export default function EditVenuePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<VenueBuilderData | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ venue: VenueFull }>(`/api/venues/${id}`)
      .then(({ venue }) => {
        if (venue.eventCount > 0) setLocked(true);
        const catIndex = new Map(venue.categories.map((c, i) => [c.id, String(i)]));
        const grid: (string | null)[][] = Array.from({ length: venue.seatRows }, () =>
          Array.from({ length: venue.seatCols }, () => null),
        );
        for (const s of venue.seats) {
          if (s.rowIndex < venue.seatRows && s.colIndex < venue.seatCols) {
            grid[s.rowIndex][s.colIndex] = catIndex.get(s.categoryId) ?? null;
          }
        }
        setInitial({
          name: venue.name,
          address: venue.address,
          city: venue.city,
          categories: venue.categories.map((c) => ({ name: c.name, color: c.color })),
          grid,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the venue"));
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/admin" className="muted inline-flex items-center gap-1.5 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Admin
      </Link>
      {error ? (
        <p className="mt-6 text-rose-400">{error}</p>
      ) : !initial ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white">Edit venue</h1>
          {locked ? (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              This venue hosts events, so the layout is locked (existing bookings reference these seats). You can still
              review the layout below.
            </div>
          ) : (
            <p className="muted mt-1">Repaint the layout - the new arrangement replaces the current one.</p>
          )}
          <div className="mt-6">
            <VenueBuilder initial={initial} mode="edit" venueId={id} readOnly={locked} onSaved={() => router.push("/admin")} />
          </div>
        </>
      )}
    </div>
  );
}
