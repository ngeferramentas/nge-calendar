"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, updateClient } from "@/app/actions/clients";
import {
  maskCep,
  maskPhoneBr,
  normalizeCep,
  normalizeEmailInput,
  normalizePhoneDigits,
} from "@/lib/masks/br";
import type { ClientRow } from "@/lib/types/database";

/** BrasilAPI CEP payload (v1/v2 share these fields we use). */
type BrasilApiCepResp = {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

async function fetchBrasilApiCep(
  version: "v1" | "v2",
  cep: string,
  signal: AbortSignal,
): Promise<BrasilApiCepResp | null> {
  const resp = await fetch(`https://brasilapi.com.br/api/cep/${version}/${cep}`, {
    signal,
  });
  if (!resp.ok) return null;
  return (await resp.json()) as BrasilApiCepResp;
}

type ClientForm = {
  documentType: "cpf" | "cnpj";
  documentNumber: string;
  fullName: string;
  email: string;
  phone: string;
  addressLine: string;
  bairro: string;
  city: string;
  state: string;
  postalCode: string;
  isActive: boolean;
};

const INITIAL_FORM: ClientForm = {
  documentType: "cpf",
  documentNumber: "",
  fullName: "",
  email: "",
  phone: "",
  addressLine: "",
  bairro: "",
  city: "",
  state: "",
  postalCode: "",
  isActive: true,
};

function rowToForm(c: ClientRow): ClientForm {
  return {
    documentType: c.document_type,
    documentNumber: c.document_normalized,
    fullName: c.full_name,
    email: c.email,
    phone: maskPhoneBr(c.phone),
    addressLine: c.address_line,
    bairro: c.bairro ?? "",
    city: c.city,
    state: c.state,
    postalCode: maskCep(c.postal_code),
    isActive: c.is_active,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (client: ClientRow) => void;
  onUpdated?: () => void;
  /** When set, modal is in edit mode for this client */
  clientToEdit?: ClientRow | null;
};

export function ClientCreateModal({
  open,
  onOpenChange,
  onCreated,
  onUpdated,
  clientToEdit = null,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const lastLookupCepRef = useRef<string>("");
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    if (!open) return;
    if (clientToEdit) {
      setForm(rowToForm(clientToEdit));
      lastLookupCepRef.current = normalizeCep(clientToEdit.postal_code);
    } else {
      setForm(INITIAL_FORM);
      lastLookupCepRef.current = "";
    }
    setCepMessage(null);
  }, [open, clientToEdit]);

  useEffect(() => {
    if (!open) return;
    const cep = normalizeCep(form.postalCode);
    if (cep.length !== 8) return;
    if (lastLookupCepRef.current === cep) return;
    lastLookupCepRef.current = cep;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setCepBusy(true);
      setCepMessage(null);
      try {
        const v2 = await fetchBrasilApiCep("v2", cep, controller.signal);
        if (!v2) throw new Error("CEP não encontrado");

        let merged: BrasilApiCepResp = v2;
        if (!v2.neighborhood?.trim()) {
          const v1 = await fetchBrasilApiCep("v1", cep, controller.signal);
          if (v1) {
            merged = {
              street: v2.street?.trim() || v1.street,
              neighborhood: v2.neighborhood?.trim() || v1.neighborhood,
              city: v2.city?.trim() || v1.city,
              state: v2.state?.trim() || v1.state,
            };
          }
        }

        setForm((f) => ({
          ...f,
          addressLine: merged.street?.trim() || f.addressLine,
          bairro: merged.neighborhood?.trim() || f.bairro,
          city: merged.city?.trim() || f.city,
          state: merged.state?.trim() || f.state,
        }));

        const hasBairro = Boolean(merged.neighborhood?.trim());
        setCepMessage(
          hasBairro
            ? "Endereço preenchido automaticamente."
            : "Endereço preenchido; informe o bairro manualmente se necessário.",
        );
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
  }, [form.postalCode, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (clientToEdit) {
      const res = await updateClient(clientToEdit.id, form);
      setSaving(false);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      onUpdated?.();
      onOpenChange(false);
      return;
    }

    const res = await createClient(form);
    setSaving(false);
    if (!res.ok || !res.data?.id) {
      alert(res.ok ? "Não foi possível criar cliente." : res.error);
      return;
    }

    const created: ClientRow = {
      id: res.data.id,
      document_type: form.documentType,
      document_normalized: form.documentNumber.replace(/\D/g, ""),
      full_name: form.fullName,
      email: normalizeEmailInput(form.email),
      phone: normalizePhoneDigits(form.phone),
      address_line: form.addressLine,
      bairro: form.bairro,
      city: form.city,
      state: form.state,
      postal_code: normalizeCep(form.postalCode),
      is_active: form.isActive,
      created_by: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onCreated?.(created);
    onOpenChange(false);
    setForm(INITIAL_FORM);
    setCepMessage(null);
    lastLookupCepRef.current = "";
  }

  if (!open) return null;

  const isEdit = Boolean(clientToEdit);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-4 text-lg font-semibold">
          {isEdit ? "Editar cliente" : "Novo cliente"}
        </h3>
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
            <label className="mb-1 block text-xs font-medium">CPF/CNPJ</label>
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
            <label className="mb-1 block text-xs font-medium">Nome completo</label>
            <input
              required
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">E-mail</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  email: normalizeEmailInput(e.target.value).replace(/\s/g, ""),
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Telefone</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: maskPhoneBr(e.target.value) }))
              }
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium">CEP</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00000-000"
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.postalCode}
              onChange={(e) => {
                setCepMessage(null);
                setForm((f) => ({ ...f, postalCode: maskCep(e.target.value) }));
              }}
            />

          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium">Logradouro</label>
            <input
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.addressLine}
              onChange={(e) =>
                setForm((f) => ({ ...f, addressLine: e.target.value }))
              }
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium">Bairro</label>
            <input
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.bairro}
              onChange={(e) =>
                setForm((f) => ({ ...f, bairro: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Cidade</label>
            <input
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">UF</label>
            <input
              className="w-full rounded border border-zinc-200 px-2 py-2 text-sm"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={!form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: !e.target.checked }))
                }
                className="rounded border-zinc-300"
              />
              Cliente inativo
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-zinc-600"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#0F9D58] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Salvando…" : isEdit ? "Atualizar" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
