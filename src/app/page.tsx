import Link from "next/link";
import { ArrowRight, BellRing, QrCode, Timer, Map as MapIcon } from "lucide-react";
import { listEvents } from "@/lib/queries";
import { EventCard } from "@/components/event-card";

export default async function LandingPage() {
  let events: Awaited<ReturnType<typeof listEvents>> = [];
  try {
    events = (await listEvents({})).slice(0, 6);
  } catch (e) {
    console.error("[landing] could not load events (is the database reachable?):", e);
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 -left-20 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-[110px]" />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:pt-28">
          <div className="max-w-3xl animate-fade-up">
            <span className="badge border border-indigo-400/30 bg-indigo-500/10 text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
              Real-time seat locking
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
              Book the seat you want.
              <br />
              <span className="text-gradient">Never lose it to a refresh.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Pick seats from a live map, get a 10-minute checkout hold, join an instant waitlist when
              sold out, and receive your QR ticket by email the second your booking confirms.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/events" className="btn-primary px-6 py-3 text-base">
                Browse events <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/register" className="btn-secondary px-6 py-3 text-base">
                Create an account
              </Link>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: <MapIcon className="h-5 w-5" />, title: "Live seat map", text: "Available, held and booked seats update in real time" },
              { icon: <Timer className="h-5 w-5" />, title: "10-min holds", text: "Abandoned checkouts release seats automatically" },
              { icon: <BellRing className="h-5 w-5" />, title: "Smart waitlist", text: "Cancellations are offered to the next in line instantly" },
              { icon: <QrCode className="h-5 w-5" />, title: "QR tickets", text: "Every confirmed booking emails a scannable QR pass" },
            ].map((f) => (
              <div key={f.title} className="card p-4 animate-fade-up">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/20 text-indigo-300">
                  {f.icon}
                </div>
                <div className="mt-3 text-sm font-bold text-white">{f.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured events */}
      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="section-title text-2xl">Coming up</h2>
            <p className="muted mt-1">Movies and concerts with live availability</p>
          </div>
          <Link href="/events" className="btn-ghost btn-sm">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {events.length === 0 ? (
          <div className="card p-10 text-center text-slate-400">
            No events scheduled yet. Run <code className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">npm run db:seed</code> to load demo data.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="section-title text-2xl">How booking works</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          {[
            { n: "1", t: "Pick your seats", d: "Tap seats on the live map. Held and booked seats are locked instantly for everyone else." },
            { n: "2", t: "10 minutes to pay", d: "A timer holds your seats. Abandon checkout and they are released automatically." },
            { n: "3", t: "Sold out? Waitlist", d: "Join the queue for a category. When someone cancels, the next in line gets an offer." },
            { n: "4", t: "QR in your inbox", d: "Confirmed bookings email a QR ticket that is scanned at the gate." },
          ].map((s) => (
            <div key={s.n} className="card card-hover p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-extrabold text-white">
                {s.n}
              </div>
              <div className="mt-3 text-sm font-bold text-white">{s.t}</div>
              <div className="mt-1.5 text-xs leading-relaxed text-slate-400">{s.d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
