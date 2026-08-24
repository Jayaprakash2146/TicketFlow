"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Briefcase, UserRound } from "lucide-react";
import { AuthShell, Field, SubmitButton } from "@/components/auth";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"CUSTOMER" | "ORGANIZER">("CUSTOMER");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...form, role }),
      });
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      router.push(role === "ORGANIZER" ? "/organizer" : "/events");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Book tickets as a customer, or list and manage events as an organizer.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["CUSTOMER", "Customer", <UserRound key="c" className="h-4 w-4" />],
              ["ORGANIZER", "Organizer", <Briefcase key="o" className="h-4 w-4" />],
            ] as const
          ).map(([val, label, icon]) => (
            <button
              key={val}
              type="button"
              onClick={() => setRole(val as typeof role)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition",
                role === val
                  ? "border-indigo-400/60 bg-indigo-500/15 text-white shadow-glow"
                  : "border-slate-400/20 bg-white/5 text-slate-300 hover:bg-white/10",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <Field label="Full name">
          <input
            className="input"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Jane Doe"
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" error={error}>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters"
          />
        </Field>
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-indigo-300 hover:text-indigo-200">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
