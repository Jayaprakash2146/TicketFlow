"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Pencil, Plus, Users } from "lucide-react";
import { EmptyState, Spinner, StatCard } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

type VenueItem = {
  id: string;
  name: string;
  address: string;
  city: string;
  seatRows: number;
  seatCols: number;
  categories: { id: string; name: string; color: string }[];
  seatCount: number;
  eventCount: number;
};

type UserRow = { id: string; name: string; email: string; role: string; createdAt: string; bookings: number };
type EmailRow = { id: string; to: string; subject: string; sent: boolean; createdAt: string };

export default function AdminDashboard() {
  const toast = useToast();
  const [venues, setVenues] = useState<VenueItem[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [emails, setEmails] = useState<EmailRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [v, u, m] = await Promise.all([
        api<{ venues: VenueItem[] }>("/api/venues"),
        api<{ users: UserRow[] }>("/api/admin/users"),
        api<{ emails: EmailRow[] }>("/api/admin/emails"),
      ]);
      setVenues(v.venues);
      setUsers(u.users);
      setEmails(m.emails);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load admin data");
      setVenues([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteVenue(id: string, name: string) {
    if (!confirm(`Delete venue "${name}"? This cannot be undone.`)) return;
    try {
      await api(`/api/venues/${id}`, { method: "DELETE" });
      toast.success("Venue deleted.");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete venue");
    }
  }

  if (!venues || !users || !emails) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const seats = venues.reduce((s, v) => s + v.seatCount, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Admin</h1>
          <p className="muted mt-1">Venues, layouts, users and the system mailbox</p>
        </div>
        <Link href="/admin/venues/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New venue
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Venues" value={String(venues.length)} />
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Total seats" value={String(seats)} tone="fuchsia" />
        <StatCard icon={<Users className="h-5 w-5" />} label="Users" value={String(users.length)} tone="amber" />
        <StatCard icon={<Mail className="h-5 w-5" />} label="Emails sent" value={String(emails.length)} tone="emerald" />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="section-title text-xl">Venues</h2>
      </div>
      {venues.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="No venues yet"
            hint="Create a venue with a painted seat layout to unlock event creation."
            action={
              <Link href="/admin/venues/new" className="btn-primary btn-sm mt-2">
                Create venue
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <div key={v.id} className="card card-hover p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-white">{v.name}</div>
                  <div className="text-xs text-slate-400">
                    {v.address}, {v.city}
                  </div>
                </div>
                <span className="badge bg-indigo-500/10 text-indigo-300">
                  {v.seatRows} x {v.seatCols}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {v.categories.map((c) => (
                  <span key={c.id} className="badge bg-white/5 text-slate-300">
                    <span className="mr-1 h-2 w-2 rounded-[3px]" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-500/10 pt-3 text-xs text-slate-400">
                <span>
                  {v.seatCount} seats - {v.eventCount} {v.eventCount === 1 ? "event" : "events"}
                </span>
                <div className="flex gap-1">
                  <Link href={`/admin/venues/${v.id}`} className="btn-ghost btn-sm" title="Edit layout">
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  {v.eventCount === 0 && (
                    <button className="btn-ghost btn-sm text-rose-400" onClick={() => deleteVenue(v.id, v.name)} title="Delete venue">
                      &times;
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-indigo-300" /> System mailbox
            </h2>
            <Link href="/admin/emails" className="text-xs font-semibold text-indigo-300 hover:text-indigo-200">
              View all
            </Link>
          </div>
          {emails.length === 0 ? (
            <p className="muted mt-3">No emails yet. Bookings and waitlist offers appear here.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {emails.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-500/15 bg-white/[0.03] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">{m.subject}</div>
                    <div className="truncate text-[11px] text-slate-500">to {m.to}</div>
                  </div>
                  <span className={m.sent ? "badge bg-emerald-500/10 text-emerald-300" : "badge bg-amber-500/10 text-amber-300"}>
                    {m.sent ? "sent" : "logged"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-indigo-300" /> Recent users
          </h2>
          {users.length === 0 ? (
            <p className="muted mt-3">No users yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {users.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-500/15 bg-white/[0.03] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-200">{u.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{u.email}</div>
                  </div>
                  <span className="badge bg-indigo-500/10 text-indigo-300">{u.role}</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/admin/users" className="mt-3 inline-block text-xs font-semibold text-indigo-300 hover:text-indigo-200">
            View all users
          </Link>
        </div>
      </div>
    </div>
  );
}
