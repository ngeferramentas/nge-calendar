"use client";

import { useState } from "react";
import type { ClientRow } from "@/lib/types/database";
import { Plus } from "lucide-react";
import { ClientCreateModal } from "@/components/client-create-modal";

export function ClientesAdmin({ initialClients }: { initialClients: ClientRow[] }) {
  const rows = initialClients;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
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
              <th className="px-4 py-3">Cidade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-medium">{c.full_name}</td>
                <td className="px-4 py-3">
                  {c.document_type.toUpperCase()} {c.document_normalized}
                </td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">
                  {c.city} / {c.state}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientCreateModal
        open={open}
        onOpenChange={setOpen}
        onCreated={() => window.location.reload()}
      />
    </div>
  );
}
