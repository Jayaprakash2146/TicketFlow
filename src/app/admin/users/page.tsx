"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/utils";
import type { SessionUser } from "@/lib/jwt";

type UserRow = { id: string; name: string; email: string; role: "CUSTOMER" | "ORGANIZER" | "ADMIN"; createdAt: string; bookings: number };

const ROLES: UserRow["role"][] = ["CUSTOMER", "ORGANIZER"];

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, m] = await Promise.all([
        api<{ users: UserRow[] }>("/api/admin/users"),
        api<{ user: SessionUser | null }>("/api/auth/me"),
      ]);
      setUsers(u.users);
      setMe(m.user);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(user: UserRow, role: UserRow["role"]) {
    if (role === user.role) return;
    setSaving(user.id);
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      toast.success(`${user.name} is now ${role.toLowerCase()}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the role");
    } finally {
      setSaving(null);
    }
  }

  if (!users) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2.5 text-3xl font-extrabold tracking-tight text-white">
        <Users className="h-7 w-7 text-indigo-300" /> Users
      </h1>
      <p className="muted mt-1">{users.length} registered accounts - change any user&apos;s role with the dropdown</p>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-500/15 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3.5">Name</th>
              <th className="px-4 py-3.5">Email</th>
              <th className="px-4 py-3.5">Role</th>
              <th className="px-4 py-3.5 text-right">Bookings</th>
              <th className="px-4 py-3.5 text-right">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = me?.id === u.id;
              return (
                <tr key={u.id} className="border-b border-slate-500/10 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5 font-semibold text-white">
                    {u.name}
                    {isSelf && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">you</span>}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3.5">
                    {isSelf ? (
                      <span className="badge bg-indigo-500/10 text-indigo-300">{u.role}</span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={saving === u.id}
                        onChange={(e) => void changeRole(u, e.target.value as UserRow["role"])}
                        className="rounded-lg border border-slate-400/20 bg-night-900 px-2 py-1 text-xs font-semibold text-slate-200 focus:border-indigo-400/60 focus:outline-none disabled:opacity-50"
                        aria-label={`Role for ${u.name}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-300">{u.bookings}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-slate-500">{formatDateTime(u.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Tip: promote a trusted user to organizer (or back to customer) with the role dropdown. This platform runs with a
        single admin account - the admin role cannot be created, signed up for, or assigned.
      </p>
    </div>
  );
}
