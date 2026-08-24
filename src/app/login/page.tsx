"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell, Field, SubmitButton } from "@/components/auth";
import { api } from "@/lib/client";
import type { SessionUser } from "@/lib/jwt";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const next = params.get("next");
      router.push(next || (user.role === "ADMIN" ? "/admin" : user.role === "ORGANIZER" ? "/organizer" : "/events"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to book tickets, manage events or view your dashboard.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" error={error}>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </Field>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">
        New here?{" "}
        <Link href="/register" className="font-semibold text-indigo-300 hover:text-indigo-200">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
