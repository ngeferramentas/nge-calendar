"use server";

import { revalidatePath } from "next/cache";
import { appendAuditLog } from "@/lib/audit";
import { requireAdmin, getSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClientRow } from "@/lib/types/database";
import {
  clientUpsertSchema,
  normalizeDocument,
  searchClientsSchema,
} from "@/lib/validations/clients";
import { normalizeCep, normalizePhoneDigits } from "@/lib/masks/br";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

export async function searchClients(query: string): Promise<ActionResult<ClientRow[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = searchClientsSchema.safeParse({ query });
    if (!parsed.success) {
      return { ok: false, error: "Busca inválida." };
    }

    // Intentionally no filter on is_active: inactive clients must remain linkable when creating events.
    const supabase = await createSupabaseServerClient();
    const raw = parsed.data.query.trim();
    const safe = raw.replace(/[%_\\]/g, "");
    const pattern = `%${safe}%`;
    const normalized = normalizeDocument(raw);
    const merged = new Map<string, ClientRow>();

    const add = (rows: ClientRow[] | null | undefined) => {
      rows?.forEach((r) => merged.set(r.id, r));
    };

    const { data: byName, error: e1 } = await supabase
      .from("clients")
      .select("*")
      .ilike("full_name", pattern)
      .limit(20);
    if (e1) throw e1;
    add(byName as ClientRow[]);

    const { data: byEmail, error: e2 } = await supabase
      .from("clients")
      .select("*")
      .ilike("email", pattern)
      .limit(20);
    if (e2) throw e2;
    add(byEmail as ClientRow[]);

    if (normalized.length >= 3) {
      const { data: byDoc, error: e3 } = await supabase
        .from("clients")
        .select("*")
        .eq("document_normalized", normalized)
        .limit(20);
      if (e3) throw e3;
      add(byDoc as ClientRow[]);
    }

    return { ok: true, data: Array.from(merged.values()).slice(0, 20) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function getClientById(
  clientId: string,
): Promise<ActionResult<ClientRow>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (error || !data) {
      return { ok: false, error: "Cliente não encontrado." };
    }
    return { ok: true, data: data as ClientRow };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function createClient(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = clientUpsertSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    const supabase = await createSupabaseServerClient();
    const d = parsed.data;
    const document_normalized = normalizeDocument(d.documentNumber);
    const phone = normalizePhoneDigits(d.phone);
    const postal_code = normalizeCep(d.postalCode);

    const { data, error } = await supabase
      .from("clients")
      .insert({
        document_type: d.documentType,
        document_normalized,
        full_name: d.fullName,
        email: d.email.trim().toLowerCase(),
        phone,
        address_line: d.addressLine,
        bairro: d.bairro,
        city: d.city,
        state: d.state,
        postal_code,
        is_active: d.isActive,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "client",
      entityId: data.id,
      action: "create",
      metadata: { document_normalized },
    });

    revalidatePath("/clientes");
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateClient(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    requireAdmin(ctx);

    const parsed = clientUpsertSchema.partial().safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    const supabase = await createSupabaseServerClient();
    const d = parsed.data;
    const updates: Record<string, unknown> = {};

    if (d.documentType !== undefined) updates.document_type = d.documentType;
    if (d.documentNumber !== undefined) {
      updates.document_normalized = normalizeDocument(d.documentNumber);
    }
    if (d.fullName !== undefined) updates.full_name = d.fullName;
    if (d.email !== undefined) updates.email = d.email.trim().toLowerCase();
    if (d.phone !== undefined) updates.phone = normalizePhoneDigits(d.phone);
    if (d.addressLine !== undefined) updates.address_line = d.addressLine;
    if (d.bairro !== undefined) updates.bairro = d.bairro;
    if (d.city !== undefined) updates.city = d.city;
    if (d.state !== undefined) updates.state = d.state;
    if (d.postalCode !== undefined) updates.postal_code = normalizeCep(d.postalCode);
    if (d.isActive !== undefined) updates.is_active = d.isActive;

    const { error } = await supabase.from("clients").update(updates).eq("id", id);

    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "client",
      entityId: id,
      action: "update",
      metadata: { updates },
    });

    revalidatePath("/clientes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function listClients(): Promise<ActionResult<ClientRow[]>> {
  try {
    const ctx = await getSessionContext();
    requireAdmin(ctx);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("is_active", { ascending: false })
      .order("full_name");

    if (error) throw error;
    return { ok: true, data: (data ?? []) as ClientRow[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteClient(id: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    requireAdmin(ctx);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "client",
      entityId: id,
      action: "delete",
      metadata: {},
    });

    revalidatePath("/clientes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
