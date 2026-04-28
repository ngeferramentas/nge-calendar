"use client";

import { useState } from "react";
import {
  createUserAccount,
  setUserPassword,
  setUserRole,
  updateUserAccess,
} from "@/app/actions/users";
import type { ProfileRow, UserRole } from "@/lib/types/database";
import { UserPlus } from "lucide-react";

export function EquipeAdmin({
  initialProfiles,
  currentUserId,
}: {
  initialProfiles: ProfileRow[];
  currentUserId: string;
}) {
  const [rows] = useState(initialProfiles);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "collaborator" as UserRole,
  });
  const [pwdUserId, setPwdUserId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await createUserAccount(form);
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setOpen(false);
    setForm({ email: "", password: "", fullName: "", role: "collaborator" });
    window.location.reload();
  }

  async function savePassword() {
    if (!pwdUserId || !newPwd) return;
    setSaving(true);
    const res = await setUserPassword({ userId: pwdUserId, newPassword: newPwd });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setPwdUserId(null);
    setNewPwd("");
    alert("Senha atualizada.");
  }

  async function toggleManager(userId: string, can: boolean) {
    setSaving(true);
    const res = await updateUserAccess({ userId, canManageUsers: can });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    window.location.reload();
  }

  async function changeRole(userId: string, role: UserRole) {
    setSaving(true);
    const res = await setUserRole(userId, role);
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white"
      >
        <UserPlus className="h-4 w-4" />
        Novo usuário
      </button>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Gestor de usuários</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-medium">{p.full_name}</td>
                <td className="px-4 py-3">
                  {p.id === currentUserId ? (
                    p.role
                  ) : (
                    <select
                      className="rounded border border-zinc-200 px-2 py-1 text-xs"
                      value={p.role}
                      disabled={saving}
                      onChange={(e) =>
                        void changeRole(p.id, e.target.value as UserRole)
                      }
                    >
                      <option value="collaborator">Colaborador</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.id === currentUserId ? (
                    p.can_manage_users ? "Sim" : "Não"
                  ) : (
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={p.can_manage_users}
                        disabled={saving}
                        onChange={(e) =>
                          void toggleManager(p.id, e.target.checked)
                        }
                      />
                      Pode gerir usuários
                    </label>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.id !== currentUserId && (
                    <button
                      type="button"
                      className="text-xs text-[#4285F4] hover:underline"
                      onClick={() => setPwdUserId(p.id)}
                    >
                      Alterar senha
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-semibold">Novo usuário</h3>
            <div className="space-y-3 text-sm">
              <input
                required
                type="email"
                placeholder="E-mail"
                className="w-full rounded border border-zinc-200 px-3 py-2"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              <input
                required
                type="password"
                placeholder="Senha (mín. 8)"
                className="w-full rounded border border-zinc-200 px-3 py-2"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              <input
                required
                placeholder="Nome completo"
                className="w-full rounded border border-zinc-200 px-3 py-2"
                value={form.fullName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fullName: e.target.value }))
                }
              />
              <select
                className="w-full rounded border border-zinc-200 px-3 py-2"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    role: e.target.value as UserRole,
                  }))
                }
              >
                <option value="collaborator">Colaborador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#0F9D58] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </form>
        </div>
      )}

      {pwdUserId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 font-semibold">Nova senha</h3>
            <input
              type="password"
              className="mb-4 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Nova senha"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded px-3 py-2 text-sm"
                onClick={() => setPwdUserId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded bg-[#4285F4] px-3 py-2 text-sm text-white"
                disabled={saving}
                onClick={() => void savePassword()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
