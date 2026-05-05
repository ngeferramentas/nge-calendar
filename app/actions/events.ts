"use server";

import { revalidatePath } from "next/cache";
import { appendAuditLog } from "@/lib/audit";
import {
  requireAdmin,
  getSessionContext,
  requireUserManager,
  type SessionContext,
} from "@/lib/auth/session";
import { assertNoTimeOverlap } from "@/lib/events/overlap";
import { scheduleEventReminder } from "@/lib/reminders/qstash";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EventEditRequestPayload,
  EventRow,
  EventStatus,
  PendingEventEditRequestRow,
} from "@/lib/types/database";
import {
  approveAndAssignSchema,
  createEventSchema,
  requestEventEditSchema,
  updateEventSchema,
  type UpdateEventInput,
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
  messageOverride?: string;
}): Promise<void> {
  if (params.recipientId === params.createdBy) return;
  const message =
    params.messageOverride ??
    (params.title
      ? `Novo agendamento: ${params.title}`
      : "Você recebeu um novo agendamento.");
  await params.supabase.from("notifications").insert({
    recipient_id: params.recipientId,
    created_by: params.createdBy,
    event_id: params.eventId,
    message,
  });
}

async function notifyManagersForPendingApproval(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  createdBy: string;
  eventId: string;
  title: string;
}): Promise<void> {
  const { data: managers, error } = await params.supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("can_manage_users", true);
  if (error || !managers?.length) return;

  const message = params.title
    ? `Novo agendamento pendente: ${params.title}`
    : "Novo agendamento pendente de aprovação.";

  const rows = managers
    .map((m) => m.id)
    .filter((id) => id !== params.createdBy)
    .map((recipientId) => ({
      recipient_id: recipientId,
      created_by: params.createdBy,
      event_id: params.eventId,
      message,
    }));

  if (rows.length === 0) return;
  await params.supabase.from("notifications").insert(rows);
}

async function notifyManagersForPendingEventEdit(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  createdBy: string;
  eventId: string;
  title: string;
}): Promise<void> {
  const { data: managers, error } = await params.supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("can_manage_users", true);
  if (error || !managers?.length) return;

  const message = params.title
    ? `Alteração pendente no agendamento: ${params.title}`
    : "Alteração pendente em um agendamento.";

  const rows = managers
    .map((m) => m.id)
    .filter((id) => id !== params.createdBy)
    .map((recipientId) => ({
      recipient_id: recipientId,
      created_by: params.createdBy,
      event_id: params.eventId,
      message,
    }));

  if (rows.length === 0) return;
  await params.supabase.from("notifications").insert(rows);
}

function collaboratorMayRequestEdit(ctx: SessionContext, row: EventRow): boolean {
  if (ctx.profile.role !== "collaborator") return false;
  return (
    row.collaborator_id === ctx.userId ||
    (row.created_by === ctx.userId && row.status === "pending_approval")
  );
}

type EventUpdatePatch = Omit<UpdateEventInput, "id">;

async function applyEventUpdateFromPatch(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  adminCtx: SessionContext,
  id: string,
  row: EventRow,
  patch: EventUpdatePatch,
): Promise<void> {
  const startsAt = patch.startsAt ?? row.starts_at;
  const endsAt = patch.endsAt ?? row.ends_at;
  const collaboratorId =
    patch.collaboratorId !== undefined
      ? patch.collaboratorId
      : row.collaborator_id;

  await assertNoTimeOverlap({
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
  if (patch.adminOnly !== undefined) updates.admin_only = patch.adminOnly;
  if (patch.collaboratorId !== undefined) {
    updates.collaborator_id = patch.collaboratorId;
    if (patch.collaboratorId && !row.assigned_at) {
      updates.assigned_at = new Date().toISOString();
    }
  }
  if (patch.startsAt !== undefined) updates.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) updates.ends_at = patch.endsAt;
  if (patch.status !== undefined) updates.status = patch.status;

  const shouldSetApproved =
    (nextStatus === "approved" || nextStatus === "assigned") && !row.approved_at;
  if (shouldSetApproved) {
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
  const nextAdminOnly =
    patch.adminOnly !== undefined ? patch.adminOnly : row.admin_only === true;
  if (
    patch.collaboratorId !== undefined &&
    patch.collaboratorId &&
    patch.collaboratorId !== row.collaborator_id &&
    !nextAdminOnly
  ) {
    await notifyCollaboratorAssignment({
      supabase,
      recipientId: patch.collaboratorId,
      createdBy: adminCtx.userId,
      eventId: id,
      title: patch.title ?? row.title,
    });
  }
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
    const adminOnly = isAdmin && input.adminOnly;

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
      } else status = input.status ?? "approved";
    }

    await assertNoTimeOverlap({
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
        admin_only: adminOnly,
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

    await appendAuditLog(supabase, {
      entityType: "event",
      entityId: data.id,
      action: "create",
      metadata: { status, collaboratorId, adminOnly },
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
    if (collaboratorId && status === "assigned" && !adminOnly) {
      await notifyCollaboratorAssignment({
        supabase,
        recipientId: collaboratorId,
        createdBy: ctx.userId,
        eventId: data.id,
        title: input.title ?? "",
      });
    }
    if (!isAdmin && status === "pending_approval") {
      await notifyManagersForPendingApproval({
        supabase,
        createdBy: ctx.userId,
        eventId: data.id,
        title: input.title ?? "",
      });
    }

    revalidatePath("/agenda");
    revalidatePath("/acoes");
    return { ok: true, data: { id: data.id } };
  } catch (e) {
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
    await applyEventUpdateFromPatch(supabase, adminCtx, id, row, patch);

    revalidatePath("/agenda");
    revalidatePath("/acoes");
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

    await assertNoTimeOverlap({
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
    if (row.admin_only !== true) {
      await notifyCollaboratorAssignment({
        supabase,
        recipientId: collaboratorId,
        createdBy: ctx!.userId,
        eventId,
        title: row.title,
        messageOverride: "Seu agendamento foi aprovado.",
      });
    }

    revalidatePath("/agenda");
    revalidatePath("/acoes");
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
    revalidatePath("/acoes");
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
    revalidatePath("/acoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function requestEventEdit(raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = requestEventEditSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parseValidationError(parsed.error) };
    }

    if (ctx.profile.role === "admin") {
      return {
        ok: false,
        error: "Administradores editam o evento diretamente na agenda.",
      };
    }

    const { eventId, ...fields } = parsed.data;
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (fetchErr || !existing) {
      return { ok: false, error: "Evento não encontrado." };
    }

    const row = existing as EventRow;

    if (!collaboratorMayRequestEdit(ctx, row)) {
      return {
        ok: false,
        error: "Sem permissão para solicitar alteração neste evento.",
      };
    }

    const startsAt = fields.startsAt ?? row.starts_at;
    const endsAt = fields.endsAt ?? row.ends_at;
    if (new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, error: "O horário de fim deve ser após o início." };
    }

    await assertNoTimeOverlap({
      startsAt,
      endsAt,
      collaboratorId: row.collaborator_id,
      excludeEventId: eventId,
    });

    const payload: EventEditRequestPayload = {};
    if (fields.title !== undefined) payload.title = fields.title;
    if (fields.description !== undefined) payload.description = fields.description;
    if (fields.clientId !== undefined) payload.clientId = fields.clientId;
    if (fields.startsAt !== undefined) payload.startsAt = fields.startsAt;
    if (fields.endsAt !== undefined) payload.endsAt = fields.endsAt;

    const { data: pendingOther, error: pendErr } = await supabase
      .from("event_edit_requests")
      .select("id, requested_by")
      .eq("event_id", eventId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendErr) throw pendErr;

    if (pendingOther && pendingOther.requested_by !== ctx.userId) {
      return {
        ok: false,
        error: "Já existe uma alteração pendente para este evento.",
      };
    }

    if (pendingOther && pendingOther.requested_by === ctx.userId) {
      const { error: delErr } = await supabase
        .from("event_edit_requests")
        .delete()
        .eq("id", pendingOther.id);
      if (delErr) throw delErr;
    }

    const { error: insErr } = await supabase.from("event_edit_requests").insert({
      event_id: eventId,
      requested_by: ctx.userId,
      payload,
      status: "pending",
    });

    if (insErr) throw insErr;

    await notifyManagersForPendingEventEdit({
      supabase,
      createdBy: ctx.userId,
      eventId,
      title: row.title,
    });

    revalidatePath("/agenda");
    revalidatePath("/acoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function listPendingEventEditRequests(): Promise<
  ActionResult<PendingEventEditRequestRow[]>
> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("event_edit_requests")
      .select(
        `
        *,
        event:events!event_id (
          *,
          clients (full_name, document_normalized, address_line, bairro),
          collaborator_profile:profiles!events_collaborator_id_fkey (calendar_color, full_name)
        ),
        requester:profiles!event_edit_requests_requested_by_fkey (full_name)
      `,
      )
      .eq("status", "pending")
      .order("created_at");

    if (error) throw error;

    return {
      ok: true,
      data: (data ?? []) as PendingEventEditRequestRow[],
    };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function approveEventEditRequest(
  requestId: string,
): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    const mgrCtx = requireUserManager(ctx);

    const supabase = await createSupabaseServerClient();

    const { data: req, error: reqErr } = await supabase
      .from("event_edit_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqErr || !req) {
      return { ok: false, error: "Solicitação não encontrada." };
    }

    if (req.status !== "pending") {
      return { ok: false, error: "Esta solicitação já foi processada." };
    }

    const { data: existing, error: evErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", req.event_id)
      .single();

    if (evErr || !existing) {
      return { ok: false, error: "Evento não encontrado." };
    }

    const row = existing as EventRow;
    const payload = req.payload as EventEditRequestPayload;
    const patch: EventUpdatePatch = {
      title: payload.title,
      description: payload.description,
      clientId: payload.clientId,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
    };

    await applyEventUpdateFromPatch(supabase, mgrCtx, req.event_id, row, patch);

    const now = new Date().toISOString();
    const { error: updReqErr } = await supabase
      .from("event_edit_requests")
      .update({
        status: "approved",
        reviewed_by: mgrCtx.userId,
        reviewed_at: now,
      })
      .eq("id", requestId);

    if (updReqErr) throw updReqErr;

    await appendAuditLog(supabase, {
      entityType: "event_edit_request",
      entityId: requestId,
      action: "approve",
      metadata: { eventId: req.event_id },
    });

    revalidatePath("/agenda");
    revalidatePath("/acoes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function rejectEventEditRequest(
  requestId: string,
): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    const mgrCtx = requireUserManager(ctx);

    const supabase = await createSupabaseServerClient();

    const { data: req, error: reqErr } = await supabase
      .from("event_edit_requests")
      .select("id, status")
      .eq("id", requestId)
      .single();

    if (reqErr || !req) {
      return { ok: false, error: "Solicitação não encontrada." };
    }

    if (req.status !== "pending") {
      return { ok: false, error: "Esta solicitação já foi processada." };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("event_edit_requests")
      .update({
        status: "rejected",
        reviewed_by: mgrCtx.userId,
        reviewed_at: now,
      })
      .eq("id", requestId)
      .eq("status", "pending");

    if (error) throw error;

    await appendAuditLog(supabase, {
      entityType: "event_edit_request",
      entityId: requestId,
      action: "reject",
      metadata: {},
    });

    revalidatePath("/agenda");
    revalidatePath("/acoes");
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

    const eventSelect =
      "*, clients(full_name, document_normalized, address_line, bairro), collaborator_profile:profiles!events_collaborator_id_fkey(calendar_color, full_name)";

    if (ctx.profile.role === "collaborator") {
      const { data, error } = await supabase
        .from("events")
        .select(eventSelect)
        .eq("admin_only", false)
        .order("starts_at");
      if (error) throw error;
      return { ok: true, data: (data ?? []) as EventRow[] };
    }

    let q = supabase.from("events").select(eventSelect).order("starts_at");
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

export async function listPendingApprovalEvents(): Promise<ActionResult<EventRow[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const supabase = await createSupabaseServerClient();
    const eventSelect =
      "*, clients(full_name, document_normalized, address_line, bairro), collaborator_profile:profiles!events_collaborator_id_fkey(calendar_color, full_name), creator_profile:profiles!events_created_by_fkey(role, full_name)";

    const { data, error } = await supabase
      .from("events")
      .select(eventSelect)
      .eq("status", "pending_approval")
      .order("starts_at");
    if (error) throw error;

    const rows = ((data ?? []) as (EventRow & {
      creator_profile?: { role?: string } | null;
    })[]).filter((row) => row.creator_profile?.role === "collaborator");
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
