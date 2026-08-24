"use client";

import { type ReactNode } from "react";
import { Ticket, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-14 lg:flex-row lg:items-center">
      <div className="hidden flex-1 lg:block">
        <div className="relative overflow-hidden rounded-3xl border border-slate-500/15 bg-gradient-to-br from-indigo-600/25 via-night-800 to-fuchsia-600/20 p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/25 blur-[90px]" />
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
              <Ticket className="h-5 w-5 text-white" />
            </span>
            <span className="text-xl font-extrabold text-white">
              Ticket<span className="text-gradient">Flow</span>
            </span>
          </div>
          <h2 className="mt-8 text-3xl font-extrabold leading-tight text-white">
            The fairest way to sell
            <br />
            tickets online.
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            {[
              "Live seat maps with real-time holds",
              "10-minute checkout windows, auto-released",
              "Sold out? Automatic waitlist with timed offers",
              "QR tickets delivered instantly by email",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex-1">
        <div className="card mx-auto max-w-md p-8">
          <h1 className="text-2xl font-extrabold text-white">{title}</h1>
          <p className="muted mt-1.5">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className={cn("btn-primary w-full py-3", busy && "opacity-70")}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

