import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, MapPin, UserRound, Info } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getSeatMap } from "@/lib/queries";
import { HttpError } from "@/lib/http";
import { SeatMap } from "@/components/seat-map";
import { Poster, TypeBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const user = await getSession();
  let data;
  try {
    data = await getSeatMap(params.id, user);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }

  const { event } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/events" className="muted mb-5 inline-flex items-center gap-1.5 text-sm hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All events
      </Link>

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <Poster title={event.title} type={event.type} posterUrl={event.posterUrl} className="h-48 w-full sm:h-auto sm:w-64 sm:shrink-0" />
          <div className="flex-1 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={event.type} />
              {data.soldOut && <span className="badge bg-rose-500/15 text-rose-300">Sold out - waitlist open</span>}
              {!data.soldOut && data.stats.availableSeats <= 10 && (
                <span className="badge bg-amber-500/15 text-amber-300">Only {data.stats.availableSeats} seats left</span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">{event.title}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-4 w-4 text-indigo-300" /> {formatDateTime(event.startsAt)} - {event.durationMin} min
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-indigo-300" /> {event.venue.name}, {event.venue.city}
              </span>
              <span className="flex items-center gap-1.5">
                <UserRound className="h-4 w-4 text-indigo-300" /> by {event.organizer}
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">{event.description}</p>
            <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Seats are held for {data.holdTtlMinutes} minutes during checkout. All statuses above update live as other customers book.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="section-title mb-4 text-xl">Choose your seats</h2>
        <SeatMap eventId={event.id} initial={data} user={user} />
      </div>
    </div>
  );
}
