"use client";

import { useEffect, useRef, useState } from "react";

export type Countdown = {
  msLeft: number;
  secondsLeft: number;
  label: string; // "09:41"
  pct: number; // 0..1 remaining
  expired: boolean;
};

/** Live countdown against an absolute ISO deadline, synced to the wall clock. */
export function useCountdown(expiresAt: string | null | undefined, durationMs?: number, tickMs = 500): Countdown {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());

  const totalRef = useRef(1);
  if (deadline && totalRef.current === 1) {
    totalRef.current = Math.max(durationMs ?? deadline - Date.now(), 1);
  }

  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [deadline, tickMs]);

  const msLeft = Math.max(0, deadline - now);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;

  return {
    msLeft,
    secondsLeft,
    label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
    pct: deadline ? Math.min(1, msLeft / totalRef.current) : 0,
    expired: deadline > 0 && msLeft <= 0,
  };
}
