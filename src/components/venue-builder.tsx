"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Loader2, PaintBucket, Save, Trash2 } from "lucide-react";
import { Field } from "@/components/auth";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { CATEGORY_PALETTE } from "@/lib/constants";

export type VenueBuilderData = {
  name: string;
  address: string;
  city: string;
  categories: { name: string; color: string }[];
  grid: (string | null)[][];
};

const PALETTE = CATEGORY_PALETTE;

function defaultGrid(rows: number, cols: number): (string | null)[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => "0"));
}

export function VenueBuilder({
  initial,
  mode,
  venueId,
  readOnly,
  onSaved,
}: {
  initial?: VenueBuilderData;
  mode: "create" | "edit";
  venueId?: string;
  readOnly?: boolean;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [categories, setCategories] = useState<{ name: string; color: string }[]>(
    initial?.categories ?? [
      { name: "Standard", color: PALETTE[1] },
      { name: "Premium", color: PALETTE[0] },
    ],
  );
  const [rows, setRows] = useState(initial?.grid.length ?? 8);
  const [cols, setCols] = useState(initial?.grid[0]?.length ?? 14);
  const [grid, setGrid] = useState<(string | null)[][]>(initial?.grid ?? defaultGrid(8, 14));
  const [tool, setTool] = useState<string>("0"); // category index or "erase"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paintingRef = useRef(false);

  useEffect(() => {
    const up = () => (paintingRef.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const resize = useCallback(
    (newRows: number, newCols: number) => {
      setRows(newRows);
      setCols(newCols);
      setGrid((g) =>
        Array.from({ length: newRows }, (_, r) =>
          Array.from({ length: newCols }, (_, c) => g[r]?.[c] ?? (r === 0 ? null : null)),
        ),
      );
    },
    [],
  );

  function paint(r: number, c: number) {
    setGrid((g) => {
      const next = g.map((row) => [...row]);
      next[r][c] = tool === "erase" ? null : tool;
      return next;
    });
  }

  function fillAll() {
    setGrid((g) => g.map((row) => row.map(() => (tool === "erase" ? null : tool))));
  }

  function setCategoryColor(idx: number, color: string) {
    setCategories((cs) => cs.map((c, i) => (i === idx ? { ...c, color } : c)));
  }

  function setCategoryName(idx: number, name: string) {
    setCategories((cs) => cs.map((c, i) => (i === idx ? { ...c, name } : c)));
  }

  function addCategory() {
    if (categories.length >= 8) {
      toast.info("Up to 8 categories per venue.");
      return;
    }
    const used = new Set(categories.map((c) => c.color));
    const color = PALETTE.find((p) => !used.has(p)) ?? PALETTE[categories.length % PALETTE.length];
    setCategories((cs) => [...cs, { name: `Category ${cs.length + 1}`, color }]);
    setTool(String(categories.length));
  }

  function removeCategory(idx: number) {
    if (categories.length <= 1) {
      toast.info("A venue needs at least one category.");
      return;
    }
    setCategories((cs) => {
      const next = cs.filter((_, i) => i !== idx);
      setGrid((g) =>
        g.map((row) =>
          row.map((cell) => {
            if (cell === null) return null;
            const i = parseInt(cell, 10);
            if (i === idx) return null;
            return String(i > idx ? i - 1 : i);
          }),
        ),
      );
      setTool("0");
      return next;
    });
  }

  const seatCount = useMemo(() => grid.flat().filter((c) => c !== null).length, [grid]);

  async function save() {
    setError("");
    if (!name.trim() || !address.trim() || !city.trim()) {
      setError("Fill in the venue name, address and city.");
      return;
    }
    if (seatCount === 0) {
      setError("Paint at least one seat on the grid.");
      return;
    }
    if (categories.some((c) => !c.name.trim())) {
      setError("Every category needs a name.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        categories: categories.map((c) => ({ name: c.name.trim(), color: c.color })),
        grid,
      };
      const res =
        mode === "create"
          ? await api<{ venue: { id: string } }>("/api/venues", { method: "POST", body: JSON.stringify(payload) })
          : await api<{ venue: { id: string } }>(`/api/venues/${venueId}`, { method: "PUT", body: JSON.stringify(payload) });
      toast.success(mode === "create" ? "Venue created." : "Venue updated.");
      onSaved(res.venue.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the venue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card grid gap-4 p-6 sm:grid-cols-3">
        <Field label="Venue name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grand Cineplex" />
        </Field>
        <Field label="Address">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 MG Road" />
        </Field>
        <Field label="City">
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
        </Field>
      </div>

      {/* categories editor */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="section-title text-base">Seat categories</div>
          <button type="button" className="btn-secondary btn-sm" onClick={addCategory}>
            Add category
          </button>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {categories.map((c, idx) => (
            <div key={idx} className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2", tool === String(idx) ? "border-indigo-400/60 bg-indigo-500/10" : "border-slate-400/20 bg-white/5")}>
              <button
                type="button"
                className="h-7 w-7 shrink-0 rounded-lg ring-2 ring-white/20"
                style={{ backgroundColor: c.color }}
                onClick={() => setTool(String(idx))}
                title="Select as paint tool"
                aria-label={`Paint with ${c.name}`}
              />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white focus:outline-none"
                value={c.name}
                onChange={(e) => setCategoryName(idx, e.target.value)}
                placeholder="Category name"
              />
              <div className="flex shrink-0 gap-1">
                {PALETTE.slice(0, 5).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCategoryColor(idx, p)}
                    className={cn("h-4 w-4 rounded-full", c.color === p && "ring-2 ring-white")}
                    style={{ backgroundColor: p }}
                    aria-label={`Use color ${p}`}
                  />
                ))}
              </div>
              <button type="button" onClick={() => removeCategory(idx)} className="text-slate-500 transition hover:text-rose-400" aria-label="Remove category">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Click a category color swatch to select it, then paint seats on the grid.</p>
      </div>

      {/* grid painter */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="section-title text-base">Seat layout ({seatCount} seats)</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Rows
              <input
                type="number"
                min={1}
                max={26}
                className="w-16 rounded-lg border border-slate-400/20 bg-night-900 px-2 py-1 text-right text-sm text-white"
                value={rows}
                onChange={(e) => resize(Math.min(26, Math.max(1, parseInt(e.target.value || "1", 10))), cols)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              Cols
              <input
                type="number"
                min={1}
                max={40}
                className="w-16 rounded-lg border border-slate-400/20 bg-night-900 px-2 py-1 text-right text-sm text-white"
                value={cols}
                onChange={(e) => resize(rows, Math.min(40, Math.max(1, parseInt(e.target.value || "1", 10))))}
              />
            </label>
            <button
              type="button"
              onClick={() => setTool("erase")}
              className={cn("btn btn-sm border border-slate-400/25", tool === "erase" ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-slate-300")}
            >
              <Eraser className="h-3.5 w-3.5" /> Eraser
            </button>
            <button type="button" onClick={fillAll} className="btn-secondary btn-sm">
              <PaintBucket className="h-3.5 w-3.5" /> Fill grid
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <div className="mb-4 h-1.5 w-1/2 rounded-full bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="mx-auto w-max select-none">
            <div className="mb-1 flex gap-1 pl-7">
              {Array.from({ length: cols }).map((_, c) => (
                <span key={c} className="w-6 text-center text-[9px] text-slate-600">
                  {c % 2 === 0 ? c + 1 : ""}
                </span>
              ))}
            </div>
            {grid.map((row, r) => (
              <div key={r} className="mb-1 flex items-center gap-1">
                <span className="w-6 text-right text-[10px] font-bold text-slate-500">{String.fromCharCode(65 + r)}</span>
                {row.map((cell, c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={() => {
                      paintingRef.current = true;
                      paint(r, c);
                    }}
                    onMouseEnter={() => paintingRef.current && paint(r, c)}
                    className={cn(
                      "h-6 w-6 rounded-[5px] transition-colors",
                      cell === null ? "bg-slate-800/60 ring-1 ring-slate-700/60" : "opacity-90 hover:opacity-100",
                    )}
                    style={cell !== null ? { backgroundColor: categories[parseInt(cell, 10)]?.color ?? "#64748b" } : undefined}
                    aria-label={`Seat ${String.fromCharCode(65 + r)}${c + 1}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Click and drag to paint. Empty cells become aisles or gaps.</p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end">
            {!readOnly && (
              <button className="btn-primary min-w-44" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {mode === "create" ? "Create venue" : "Save changes"}
              </button>
            )}
          </div>
    </div>
  );
}
