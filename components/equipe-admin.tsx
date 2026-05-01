"use client";

import { useState } from "react";
import {
  createUserAccount,
  deleteTeamMember,
  setUserPassword,
  setUserRole,
  updateTeamMemberProfile,
  updateUserAccess,
} from "@/app/actions/users";
import {
  CALENDAR_COLOR_PRESETS,
  GOOGLE_PALETTE,
  type ProfileRow,
  type UserRole,
} from "@/lib/types/database";
import { formatDatePtBr } from "@/lib/format/locale";
import { KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";

const DEFAULT_HEX: string = GOOGLE_PALETTE.blue;

function normalizeHexInput(raw: string): string {
  const t = raw.trim();
  if (!t) return DEFAULT_HEX;
  const withHash = t.startsWith("#") ? t : `#${t}`;
  return withHash.slice(0, 7).toUpperCase();
}

function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

export function EquipeAdmin({
  initialProfiles,
  currentUserId,
}: {
  initialProfiles: ProfileRow[];
  currentUserId: string;
}) {
  const [rows] = useState(initialProfiles);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    calendarColor: string;
    birthDate: string;
  }>({
    email: "",
    password: "",
    fullName: "",
    role: "collaborator",
    calendarColor: DEFAULT_HEX,
    birthDate: "",
  });
  const [editForm, setEditForm] = useState<{
    fullName: string;
    calendarColor: string;
    birthDate: string;
  }>({
    fullName: "",
    calendarColor: DEFAULT_HEX,
    birthDate: "",
  });
  const [pwdUserId, setPwdUserId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidHex(form.calendarColor)) {
      alert("Informe uma cor hexadecimal válida (#RRGGBB).");
      return;
    }
    setSaving(true);
    const res = await createUserAccount({
      email: form.email,
      password: form.password,
      fullName: form.fullName,
      role: form.role,
      calendarColor: form.calendarColor,
      birthDate: form.birthDate || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setOpen(false);
    setForm({
      email: "",
      password: "",
      fullName: "",
      role: "collaborator",
      calendarColor: DEFAULT_HEX,
      birthDate: "",
    });
    window.location.reload();
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editOpen) return;
    if (!isValidHex(editForm.calendarColor)) {
      alert("Informe uma cor hexadecimal válida (#RRGGBB).");
      return;
    }
    setSaving(true);
    const res = await updateTeamMemberProfile({
      userId: editOpen.id,
      fullName: editForm.fullName,
      calendarColor: editForm.calendarColor,
      birthDate: editForm.birthDate || null,
    });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setEditOpen(null);
    window.location.reload();
  }

  async function handleDelete(p: ProfileRow) {
    if (p.id === currentUserId) return;
    const ok = window.confirm(
      `Excluir permanentemente o usuário "${p.full_name}"? Os vínculos de eventos e clientes criados por ele serão reatribuídos a você.`,
    );
    if (!ok) return;
    setSaving(true);
    const res = await deleteTeamMember({ userId: p.id });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    window.location.reload();
  }

  function openEdit(p: ProfileRow) {
    setEditOpen(p);
    setEditForm({
      fullName: p.full_name,
      calendarColor: p.calendar_color ?? DEFAULT_HEX,
      birthDate: p.birth_date ? p.birth_date.slice(0, 10) : "",
    });
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

  function formatBirthDisplay(iso: string | null): string {
    if (!iso) return "—";
    const [ys, ms, ds] = iso.slice(0, 10).split("-");
    const y = Number(ys);
    const m = Number(ms);
    const d = Number(ds);
    if (!y || !m || !d) return "—";
    return formatDatePtBr(new Date(y, m - 1, d));
  }

  const ColorFields = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (hex: string) => void;
  }) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600">Cor na agenda</p>
      <div className="flex flex-wrap gap-2">
        {CALENDAR_COLOR_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            className={`h-8 w-8 rounded-full border-2 ${
              value.toUpperCase() === hex.toUpperCase()
                ? "border-zinc-900 ring-2 ring-zinc-400"
                : "border-zinc-200"
            }`}
            style={{ backgroundColor: hex }}
            onClick={() => onChange(hex)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="hex-input" className="text-xs text-zinc-500">
          Hex
        </label>
        <input
          id="hex-input"
          type="text"
          placeholder="#4285F4"
          className="flex-1 rounded border border-zinc-200 px-3 py-2 font-mono text-sm uppercase"
          value={value}
          onChange={(e) => onChange(normalizeHexInput(e.target.value))}
          maxLength={7}
        />
        {!isValidHex(value) && (
          <span className="text-xs text-red-600">Inválido</span>
        )}
      </div>
    </div>
  );

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
              <th className="px-4 py-3">Cor</th>
              <th className="px-4 py-3">Aniversário</th>
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
                  <span
                    className="inline-block h-6 w-6 rounded-full border border-zinc-200"
                    style={{
                      backgroundColor: p.calendar_color ?? DEFAULT_HEX,
                    }}
                    title={p.calendar_color ?? DEFAULT_HEX}
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatBirthDisplay(p.birth_date)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
                      title="Editar dados"
                      disabled={saving}
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {p.id !== currentUserId && (
                      <>
                        <button
                          type="button"
                          className="rounded p-1.5 text-[#4285F4] hover:bg-zinc-100"
                          title="Alterar senha"
                          disabled={saving}
                          onClick={() => setPwdUserId(p.id)}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                          title="Excluir usuário"
                          disabled={saving}
                          onClick={() => void handleDelete(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
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
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
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
              <ColorFields
                value={form.calendarColor}
                onChange={(hex) =>
                  setForm((f) => ({ ...f, calendarColor: hex }))
                }
              />
              <label className="block text-xs font-medium text-zinc-600">
                Data de nascimento (opcional)
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-zinc-200 px-3 py-2"
                  value={form.birthDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, birthDate: e.target.value }))
                  }
                />
              </label>
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

      {editOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleEditSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-semibold">Editar dados</h3>
            <p className="mb-3 text-xs text-zinc-500">{editOpen.full_name}</p>
            <div className="space-y-3 text-sm">
              <input
                required
                placeholder="Nome completo"
                className="w-full rounded border border-zinc-200 px-3 py-2"
                value={editForm.fullName}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, fullName: e.target.value }))
                }
              />
              <ColorFields
                value={editForm.calendarColor}
                onChange={(hex) =>
                  setEditForm((f) => ({ ...f, calendarColor: hex }))
                }
              />
              <label className="block text-xs font-medium text-zinc-600">
                Data de nascimento (opcional)
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-zinc-200 px-3 py-2"
                  value={editForm.birthDate}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, birthDate: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm"
                onClick={() => setEditOpen(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Salvar
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
