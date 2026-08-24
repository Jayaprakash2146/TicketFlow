"use client";

import { Film, Music, Sparkles, Users, BarChart3, ShieldCheck } from "lucide-react";
import { cn, formatDateTime, formatMoney, initials } from "@/lib/utils";
import { useEffect, type ReactNode } from "react";

export function TypeBadge({ type }: { type: "MOVIE" | "CONCERT" }) {
  return type === "MOVIE" ? (
    <span className="badge bg-indigo-500/15 text-indigo-300">
      <Film className="h-3 w-3" /> Movie
    </span>
  ) : (
    <span className="badge bg-fuchsia-500/15 text-fuchsia-300">
      <Music className="h-3 w-3" /> Concert
    </span>
  );
}

/** Gradient poster with title initials - no external images needed. */
export function Poster({
  title,
  type,
  posterUrl,
  className,
  size = "text-4xl",
}: {
  title: string;
  type: "MOVIE" | "CONCERT";
  posterUrl?: string | null;
  className?: string;
  size?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br",
        type === "MOVIE" ? "from-indigo-600/60 via-violet-700/40 to-slate-900" : "from-fuchsia-600/50 via-purple-700/40 to-slate-900",
        className,
      )}
    >
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterUrl} alt={title} className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,.35),transparent_45%)]" />
          {type === "MOVIE" ? (
            <Film className={cn("h-12 w-12 text-white/70", size)} />
          ) : (
            <Music className={cn("h-12 w-12 text-white/70", size)} />
          )}
          <span className={cn("absolute bottom-3 left-0 right-0 px-3 text-center text-sm font-bold uppercase tracking-widest text-white/85", size)}>
            {initials(title)}
          </span>
        </>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-5 w-5 animate-spin rounded-full border-2 border-slate-500/40 border-t-indigo-400", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "indigo",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "indigo" | "emerald" | "amber" | "fuchsia";
}) {
  const tones = {
    indigo: "from-indigo-500/20 text-indigo-300",
    emerald: "from-emerald-500/20 text-emerald-300",
    amber: "from-amber-500/20 text-amber-300",
    fuchsia: "from-fuchsia-500/20 text-fuchsia-300",
  } as const;
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br to-transparent", tones[tone])}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="muted truncate text-xs font-medium uppercase tracking-wider">{label}</div>
          <div className="truncate text-xl font-bold text-white">{value}</div>
          {sub && <div className="truncate text-xs text-slate-500">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
        {icon ?? <Sparkles className="h-6 w-6" />}
      </div>
      <div className="text-base font-semibold text-white">{title}</div>
      {hint && <div className="muted max-w-sm">{hint}</div>}
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cn("card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-2xl animate-pop-in", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        {children}
      </div>
    </div>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={className}>{formatMoney(cents)}</span>;
}

export function When({ iso }: { iso: string }) {
  return <span className="whitespace-nowrap">{formatDateTime(iso)}</span>;
}

export const RoleIcon = { Users, BarChart3, ShieldCheck };
