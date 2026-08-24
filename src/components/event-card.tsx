"use client";

import Link from "next/link";
import { Clock3, MapPin, Users } from "lucide-react";
import { Poster, TypeBadge } from "@/components/ui";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";

export type EventListItem = {
  id: string;
  title: string;
  type: "MOVIE" | "CONCERT";
  posterUrl: string | null;
  startsAt: string;
  venue: { name: string; city: string };
  minPriceCents: number;
  capacity: number;
  booked: number;
  available: number;
  soldOut: boolean;
  fewLeft: boolean;
};

export function EventCard({ event }: { event: EventListItem }) {
  return (
    <Link href={`/events/${event.id}`} className="card card-hover group overflow-hidden">
      <div className="relative">
        <Poster title={event.title} type={event.type} posterUrl={event.posterUrl} className="h-40 w-full" />
        <div className="absolute left-3 top-3 flex gap-2">
          <TypeBadge type={event.type} />
        </div>
        {event.soldOut && (
          <span className="badge absolute right-3 top-3 bg-rose-500/90 text-white">SOLD OUT</span>
        )}
        {!event.soldOut && event.fewLeft && (
          <span className="badge absolute right-3 top-3 bg-amber-500/90 text-black">Few seats left</span>
        )}
      </div>
      <div className="p-4">
        <div className="truncate text-base font-bold text-white group-hover:text-indigo-300">{event.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <Clock3 className="h-3.5 w-3.5" /> {formatDateTime(event.startsAt)}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
          <MapPin className="h-3.5 w-3.5" /> {event.venue.name}, {event.venue.city}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-500/10 pt-3">
          <span className="text-sm font-bold text-white">
            {event.soldOut ? (
              <span className="text-rose-400">Waitlist open</span>
            ) : (
              <>
                {event.minPriceCents > 0 ? (
                  <>
                    {formatMoney(event.minPriceCents)} <span className="text-xs font-normal text-slate-500">onwards</span>
                  </>
                ) : (
                  "Free"
                )}
              </>
            )}
          </span>
          <span
            className={cn(
              "badge",
              event.soldOut ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300",
            )}
          >
            <Users className="h-3 w-3" />
            {event.soldOut ? `${event.capacity} seats` : `${event.available} left`}
          </span>
        </div>
      </div>
    </Link>
  );
}
