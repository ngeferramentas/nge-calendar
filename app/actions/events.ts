"use server";

import { revalidatePath } from "next/cache";
import { appendAuditLog } from "@/lib/audit";
import { requireAdmin, getSessionContext } from "@/lib/auth/session";
import { assertNoTimeOverlap } from "@/lib/events/overlap";
import { scheduleEventReminder } from "@/lib/reminders/qstash";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventRow, EventStatus } from "@/lib/types/database";
import {
  approveAndAssignSchema,
  createEventSchema,
  updateEventSchema,
} from "@/lib/validations/events";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

function parseValidationError(raw: unknown): string {
  const fallback = "Dados inválidos. Revise os campos e tente novamente.";
  if (!raw || typeof raw !== "object" || !("flatten" in raw)) return fallback;
  const flattened = (raw as { flatten: () => { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> } }).flatten();
  const formErrors = flattened.formErrors ?? [];
  const fieldErrors = Object.values(flattened.fieldErrors ?? {}).flatMap(
    (messages) => messages ?? [],
  );
  const messages = [...formErrors, ...fieldErrors].filter(Boolean);
  if (messages.length === 0) return fallback;
  return messages.join(", ");
}

async function notifyCollaboratorAssignment(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  recipientId: string;
  createdBy: string;
  eventId: string;
  title: string;
}): Promise<void> {
  if (params.recipientId === params.createdBy) return;
  const message = params.title
    ? `Novo agendamento: ${params.title}`
    : "Você recebeu um novo agendamento.";
  await params.supabase.from("notifications").insert({
    recipient_id: params.recipientId,
    created_by: params.createdBy,
    event_id: params.eventId,
    message,
  });
}

export async function createEvent(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = createEventSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parseValidationError(parsed.error) };
    }

    const supabase = await createSupabaseServerClient();
    const isAdmin = ctx.profile.role === "admin";
    const input = parsed.data;
    // #region agent log
    fetch("http://127.0.0.1:7285/ingest/5ec2dab7-dfe7-4ae0-84b8-6b4bcc309c97", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f92143",
      },
      body: JSON.stringify({
        sessionId: "f92143",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "app/actions/events.ts:createEvent",
        message: "createEvent input received",
        data: {
          hasCollaboratorId: Boolean(input.collaboratorId),
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          isAdmin,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    let status: EventStatus;
    const collaboratorId = input.collaboratorId;
    let assignedAt: string | null = null;
    let approvedAt: string | null = null;
    let approvedBy: string | null = null;

    if (!isAdmin) {
      status = "pending_approval";
    } else {
      if (collaboratorId) {
        status = "assigned";
        assignedAt = new Date().toISOString();
        approvedBy = ctx.userId;
        approvedAt = assignedAt;
      } else {
        status = input.status ?? "confirmed";
      }
    }

    await assertNoTimeOverlap(supabase, {
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      collaboratorId,
    });

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: input.title ?? "",
        description: input.description ?? "",
        client_id: input.clientId,
        collaborator_id: collaboratorId,
        created_by: ctx.userId,
        status,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        approved_by: approvedBy,
        approved_at: approvedAt,
        assigned_at: assignedAt,
      })
      .select("id")
      .single();

    if (error) throw error;
    // #region agent log
    fetch("http://127.0.0.1:7285/ingest/5ec2dab7-dfe7-4ae0-84b8-6b4bcc309c97", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f92143",
      },
      body: JSON.stringify({
        sessionId: "f92143",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "app/actions/events.ts:createEvent",
        message: "Event inserted in database",
        data: { eventId: data.id, status, hasCollaboratorId: Boolean(collaboratorId) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    await appendAuditLog(supabase, {
      entityType: "event",
      entityId: data.id,
      action: "create",
      metadata: { status, collaboratorId },
    });

    if (collaboratorId && status === "assigned") {
      try {
        await scheduleEventReminder({
          eventId: data.id,
          startsAtIso: input.startsAt,
        });
      } catch {
        // Reminders should never block event creation.
      }
    }
    if (collaboratorId && status === "assigned") {
      await notifyCollaboratorAssignment({
        supabase,
        recipientId: collaboratorId,
        createdBy: ctx.userId,
        eventId: data.id,
        title: input.title ?? "",
      });
    }

    revalidatePath("/agenda");
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    // #region agent log
    fetch("http://127.0.0.1:7285/ingest/5ec2dab7-dfe7-4ae0-84b8-6b4bcc309c97", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f92143",
      },
      body: JSON.stringify({
        sessionId: "f92143",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "app/actions/events.ts:createEvent:catch",
        message: "createEvent failed",
        data: { error: err(e) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return { ok: false, error: err(e) };
  }
}

export async function updateEvent(raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    const adminCtx = requireAdmin(ctx);

    const parsed = updateEventSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parseValidationError(parsed.error) };
    }

    const supabase = await createSupabaseServerClient();
    const { id, ...patch } = parsed.data;

    const { data: existing, error: fetchErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return { ok: false, error: "Evento não encontrado." };
    }

    const row = existing as EventRow;
    const startsAt = patch.startsAt ?? row.starts_at;
    const endsAt = patch.endsAt ?? row.ends_at;
    const collaboratorId =
      patch.collaboratorId !== undefined
        ? patch.collaboratorId
        : row.collaborator_id;

    await assertNoTimeOverlap(supabase, {
      startsAt,
      endsAt,
      collaboratorId,
      excludeEventId: id,
    });

    const nextStatus = patch.status ?? row.status;
    const updates: Record<string, unknown> = {};

    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.description !== undefined) updates.description = patch.description;
    if (patch.clientId !== undefined) updates.client_id = patch.clientId;
    if (patch.collaboratorId !== undefined) {
      updates.collaborator_id = patch.collaboratorId;
      if (patch.collaboratorId && !row.assigned_at) {
        updates.assigned_at = new Date().toISOString();
      }
    }
    if (patch.startsAt !== undefined) updates.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) updates.ends_at = patch.endsAt;
    if (patch.status !== undefined) updates.status = patch.status;

    if (nextStatus === "assigned" && !row.approved_at) {
      updates.approved_by = adminCtx.userId;
      updates.approved_at = new Date().toISOString();
    }

    const { error } = await supabase.from("events").update(updates).eq("id", id);

    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "event",
      entityId: id,
      action: "update",
      metadata: { before: row, patch },
    });

    if (
      patch.startsAt !== undefined ||
      (row.collaborator_id === null && collaboratorId)
    ) {
      if (collaboratorId && nextStatus === "assigned") {
        try {
          await scheduleEventReminder({ eventId: id, startsAtIso: startsAt });
        } catch {
          // Reminders should never block event updates.
        }
      }
    }
    if (
      patch.collaboratorId !== undefined &&
      patch.collaboratorId &&
      patch.collaboratorId !== row.collaborator_id
    ) {
      await notifyCollaboratorAssignment({
        supabase,
        recipientId: patch.collaboratorId,
        createdBy: adminCtx.userId,
        eventId: id,
        title: patch.title ?? row.title,
      });
    }

    revalidatePath("/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function approveAndAssignEvent(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    requireAdmin(ctx);

    const parsed = approveAndAssignSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parseValidationError(parsed.error) };
    }

    const supabase = await createSupabaseServerClient();
    const { eventId, collaboratorId } = parsed.data;

    const { data: existing, error: fetchErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (fetchErr || !existing) {
      return { ok: false, error: "Evento não encontrado." };
    }

    const row = existing as EventRow;
    if (row.status !== "pending_approval") {
      return { ok: false, error: "Apenas eventos pendentes podem ser aprovados." };
    }

    await assertNoTimeOverlap(supabase, {
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      collaboratorId,
      excludeEventId: eventId,
    });

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("events")
      .update({
        status: "assigned",
        collaborator_id: collaboratorId,
        approved_by: ctx!.userId,
        approved_at: now,
        assigned_at: now,
      })
      .eq("id", eventId);

    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "event",
      entityId: eventId,
      action: "approve_assign",
      metadata: { collaboratorId },
    });

    try {
      await scheduleEventReminder({
        eventId,
        startsAtIso: row.starts_at,
      });
    } catch {
      // Reminders should never block event approval and assignment.
    }
    await notifyCollaboratorAssignment({
      supabase,
      recipientId: collaboratorId,
      createdBy: ctx!.userId,
      eventId,
      title: row.title,
    });

    revalidatePath("/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function rejectEvent(eventId: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    requireAdmin(ctx);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("events")
      .update({ status: "rejected" })
      .eq("id", eventId);

    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "event",
      entityId: eventId,
      action: "reject",
      metadata: {},
    });

    revalidatePath("/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    requireAdmin(ctx);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "event",
      entityId: eventId,
      action: "delete",
      metadata: {},
    });

    revalidatePath("/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function listEventsForUser(params?: {
  collaboratorFilterId?: string | null;
}): Promise<ActionResult<EventRow[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();

    if (ctx.profile.role === "collaborator") {
      const { data, error } = await supabase
        .from("events")
        .select("*, clients(full_name, document_normalized)")
        .or(
          `collaborator_id.eq.${ctx.userId},and(created_by.eq.${ctx.userId},status.eq.pending_approval)`,
        )
        .order("starts_at");
      if (error) throw error;
      return { ok: true, data: (data ?? []) as EventRow[] };
    }

    let q = supabase
      .from("events")
      .select("*, clients(full_name, document_normalized)")
      .order("starts_at");
    if (params?.collaboratorFilterId) {
      q = q.eq("collaborator_id", params.collaboratorFilterId);
    }
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true, data: (data ?? []) as EventRow[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
