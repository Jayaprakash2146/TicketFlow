"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * Searchable dropdown: type to filter, click to pick. Supports an optional
 * "clear" entry (e.g. All cities) and a footer slot (e.g. Create new venue).
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  clearLabel,
  footer,
  className,
  disabled,
}: {
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearLabel?: string;
  footer?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = query
    ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(query))
    : options;
  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
        }}
        className="input flex items-center justify-between gap-2 text-left"
      >
        <span className={cn("truncate", !selected && "text-slate-500")}>
          {selected?.label ?? placeholder ?? "Select..."}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-500/20 bg-night-800 shadow-card animate-pop-in">
          <div className="border-b border-slate-500/10 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder ?? "Type to search..."}
                className="w-full rounded-lg border border-slate-400/20 bg-night-900 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400/60 focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {clearLabel && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-indigo-300 hover:bg-white/5"
              >
                {clearLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">{emptyText ?? "No matches"}</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/5",
                    o.value === value ? "bg-white/10 text-white" : "text-slate-300",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[11px] text-slate-500">{o.hint}</span>}
                </button>
              ))
            )}
          </div>
          {footer && <div className="border-t border-slate-500/10 p-1.5">{footer}</div>}
        </div>
      )}
    </div>
  );
}
