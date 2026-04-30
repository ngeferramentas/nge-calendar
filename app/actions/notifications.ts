"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/types/database";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

export async function listMyNotifications(): Promise<ActionResult<NotificationRow[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return { ok: true, data: (data ?? []) as NotificationRow[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function listMyNotificationsPage(): Promise<
  ActionResult<NotificationRow[]>
> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return { ok: true, data: (data ?? []) as NotificationRow[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("recipient_id", ctx.userId);

    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function markAllMyNotificationsRead(): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", ctx.userId)
      .eq("is_read", false);

    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteMyNotification(id: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("recipient_id", ctx.userId);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
