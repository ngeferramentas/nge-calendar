"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/app/actions/clients";
import type { ClientRow } from "@/lib/types/database";
import { Plus } from "lucide-react";

export function ClientesAdmin({ initialClients }: { initialClients: ClientRow[] }) {
  const rows = initialClients;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const lastLookupCepRef = useRef<string>("");
  const [form, setForm] = useState({
    documentType: "cpf" as "cpf" | "cnpj",
    documentNumber: "",
    fullName: "",
    email: "",
    phone: "",
    addressLine: "",
    city: "",
    state: "",
    postalCode: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await createClient(form);
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setOpen(false);
    setForm({
      documentType: "cpf",
      documentNumber: "",
      fullName: "",
      email: "",
      phone: "",
      addressLine: "",
      city: "",
      state: "",
      postalCode: "",
    });
    window.location.reload();
  }

  useEffect(() => {
    const cep = form.postalCode.replace(/\D/g, "");
    if (cep.length !== 8) {
      return;
    }
    if (lastLookupCepRef.current === cep) return;
    lastLookupCepRef.current = cep;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setCepBusy(true);
      setCepMessage(null);
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error("CEP não encontrado");
        const data = (await resp.json()) as {
          street?: string;
          city?: string;
          state?: string;
        };
        setForm((f) => ({
          ...f,
          addressLine: data.street?.trim() || f.addressLine,
          city: data.city?.trim() || f.city,
          state: data.state?.trim() || f.state,
        }));
        setCepMessage("Endereço preenchido automaticamente.");
      } catch {
        setCepMessage("Não foi possível consultar este CEP. Preencha manualmente.");
      } finally {
        setCepBusy(false);
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [form.postalCode]);

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

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleCreate}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="mb-4 text-lg font-semibold">Novo cliente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Tipo</label>
                <select
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.documentType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      documentType: e.target.value as "cpf" | "cnpj",
                    }))
                  }
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">
                  CPF/CNPJ
                </label>
                <input
                  required
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.documentNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, documentNumber: e.target.value }))
                  }
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">
                  Nome completo
                </label>
                <input
                  required
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">E-mail</label>
                <input
                  type="email"
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">
                  Telefone
                </label>
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">CEP</label>
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.postalCode}
                  onChange={(e) => {
                    setCepMessage(null);
                    setForm((f) => ({ ...f, postalCode: e.target.value }));
                  }}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  {cepBusy
                    ? "Consultando CEP..."
                    : (cepMessage ?? "Informe o CEP para preencher endereço automaticamente.")}
                </p>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">
                  Endereço
                </label>
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.addressLine}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, addressLine: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Cidade</label>
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">UF</label>
                <input
                  className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                  value={form.state}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-zinc-600"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#0F9D58] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
