"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardList, LogOut, ShieldCheck, Ticket, UserRound, Briefcase } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { api } from "@/lib/client";
import type { SessionUser } from "@/lib/jwt";

export function Navbar({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/events", label: "Events", show: true },
    { href: "/bookings", label: "My Bookings", show: !!user },
    { href: "/organizer", label: "Organizer", show: user?.role === "ORGANIZER" || user?.role === "ADMIN" },
    { href: "/admin", label: "Admin", show: user?.role === "ADMIN" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-500/10 bg-night-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-glow">
            <Ticket className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white">
            Ticket<span className="text-gradient">Flow</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  pathname.startsWith(l.href) ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                {l.label}
              </Link>
            ))}
        </div>

        <div className="flex items-center gap-2">
          {!user ? (
            <>
              <Link href="/login" className="btn-ghost btn-sm">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary btn-sm">
                Get started
              </Link>
            </>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl border border-slate-400/20 bg-white/5 py-1.5 pl-1.5 pr-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[11px] font-bold text-white">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[110px] truncate sm:block">{user.name.split(" ")[0]}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-slate-500/20 bg-night-800 shadow-card animate-pop-in">
                  <div className="border-b border-slate-500/10 px-4 py-3">
                    <div className="truncate text-sm font-semibold text-white">{user.name}</div>
                    <div className="truncate text-xs text-slate-400">{user.email}</div>
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                      {user.role === "ADMIN" && <ShieldCheck className="h-3 w-3" />}
                      {user.role === "ORGANIZER" && <Briefcase className="h-3 w-3" />}
                      {user.role === "CUSTOMER" && <UserRound className="h-3 w-3" />}
                      {user.role}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 p-1.5 md:hidden">
                    {links
                      .filter((l) => l.show)
                      .map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => setMenuOpen(false)}
                          className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
                        >
                          {l.label}
                        </Link>
                      ))}
                  </div>
                  <div className="p-1.5">
                    {user && (
                      <Link
                        href="/bookings"
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 md:hidden"
                      >
                        <ClipboardList className="h-4 w-4" /> My Bookings
                      </Link>
                    )}
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t border-slate-500/10 bg-night-950/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500">
              <Ticket className="h-4 w-4 text-white" />
            </span>
            <span className="font-extrabold text-white">TicketFlow</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Real-time seat locking, smart waitlists and instant QR tickets for movies and concerts.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Explore</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li><Link href="/events" className="hover:text-white">Browse events</Link></li>
            <li><Link href="/bookings" className="hover:text-white">My bookings</Link></li>
            <li><Link href="/register" className="hover:text-white">Create an account</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Built with</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>Next.js 14 - App Router</li>
            <li>PostgreSQL + Prisma</li>
            <li>JWT role-based auth</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-500/10 py-4 text-center text-xs text-slate-500">
        TicketFlow - demo project. Seats hold for 10 minutes; waitlist offers expire automatically.
      </div>
    </footer>
  );
}
