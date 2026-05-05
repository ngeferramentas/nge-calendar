"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow } from "@/lib/types/database";
import { deleteClient } from "@/app/actions/clients";
import { maskCep, maskPhoneBr } from "@/lib/masks/br";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ClientCreateModal } from "@/components/client-create-modal";

export function ClientesAdmin({ initialClients }: { initialClients: ClientRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientRow | null>(null);

  async function handleDelete(c: ClientRow) {
    const ok = window.confirm(
      `Excluir o cliente "${c.full_name}"? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    const res = await deleteClient(c.id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => {
          setEditClient(null);
          setCreateOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" />
        Novo cliente
      </button>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Endereço</th>
              <th className="px-4 py-3 w-28">Ações</th>
            </tr>
          </thead>
          <tbody>
            {initialClients.map((c) => (
              <tr key={c.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-medium">
                  {c.full_name}
                  {!c.is_active ? (
                    <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-normal text-zinc-700">
                      Inativo
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {c.document_type.toUpperCase()} {c.document_normalized}
                </td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3">
                  {c.phone ? maskPhoneBr(c.phone) : "—"}
                </td>
                <td className="px-4 py-3">
                  {c.city} / {c.state}
                  {c.postal_code ? (
                    <span className="ml-1 text-zinc-500">
                      · CEP {maskCep(c.postal_code)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Editar ${c.full_name}`}
                      className="rounded p-2 text-zinc-600 hover:bg-zinc-100"
                      onClick={() => {
                        setEditClient(c);
                        setCreateOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${c.full_name}`}
                      className="rounded p-2 text-[#DB4437] hover:bg-red-50"
                      onClick={() => void handleDelete(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientCreateModal
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setEditClient(null);
        }}
        clientToEdit={editClient}
        onCreated={() => router.refresh()}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
