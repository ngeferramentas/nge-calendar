"use server";

import { revalidatePath } from "next/cache";
import { appendAuditLog } from "@/lib/audit";
import {
  getSessionContext,
  requireAdmin,
  requireUserManager,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type {
  CollaboratorCalendarMeta,
  ProfileRow,
  UserRole,
} from "@/lib/types/database";
import { z } from "zod";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida (use #RRGGBB).");

function normalizeHex(hex: string): string {
  return hex.toUpperCase();
}

const optionalBirthDateSchema = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
);

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(300),
  role: z.enum(["admin", "collaborator"]).default("collaborator"),
  calendarColor: hexColorSchema.default("#4285F4"),
  birthDate: optionalBirthDateSchema,
});

const updateTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(2).max(300),
  calendarColor: hexColorSchema,
  birthDate: optionalBirthDateSchema,
});

const deleteTeamMemberSchema = z.object({
  userId: z.string().uuid(),
});

const setPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8),
});

const promoteSchema = z.object({
  userId: z.string().uuid(),
  canManageUsers: z.boolean(),
});

const searchCollaboratorsSchema = z.object({
  query: z.string().trim().min(1).max(120),
});

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

export async function listCollaborators(): Promise<
  ActionResult<{ id: string; full_name: string; calendar_color: string }[]>
> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireAdmin(ctx);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, calendar_color")
      .eq("role", "collaborator")
      .order("full_name");

    if (error) throw error;
    return {
      ok: true,
      data: (data ?? []) as {
        id: string;
        full_name: string;
        calendar_color: string;
      }[],
    };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function searchCollaborators(
  query: string,
): Promise<ActionResult<{ id: string; full_name: string }[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = searchCollaboratorsSchema.safeParse({ query });
    if (!parsed.success) {
      return { ok: false, error: "Busca inválida." };
    }

    const safe = parsed.data.query.replace(/[%_\\]/g, "");
    const pattern = `%${safe}%`;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "collaborator")
      .ilike("full_name", pattern)
      .order("full_name")
      .limit(20);

    if (error) throw error;
    return { ok: true, data: (data ?? []) as { id: string; full_name: string }[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function listCollaboratorCalendarMeta(): Promise<
  ActionResult<CollaboratorCalendarMeta[]>
> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service
      .from("profiles")
      .select("id, full_name, calendar_color, birth_date")
      .eq("role", "collaborator")
      .order("full_name");

    if (error) throw error;
    return {
      ok: true,
      data: (data ?? []) as CollaboratorCalendarMeta[],
    };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function listTeamProfiles(): Promise<ActionResult<ProfileRow[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    if (error) throw error;
    return { ok: true, data: (data ?? []) as ProfileRow[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function createUserAccount(
  raw: unknown,
): Promise<ActionResult<{ userId: string }>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const parsed = createUserSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });

    if (error) throw error;
    if (!data.user) throw new Error("Falha ao criar usuário.");

    const birthDate = parsed.data.birthDate ?? null;
    const color = normalizeHex(parsed.data.calendarColor);

    const { error: pe } = await service
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        role: parsed.data.role as UserRole,
        calendar_color: color,
        birth_date: birthDate,
      })
      .eq("id", data.user.id);

    if (pe) throw pe;

    const supabase = await createSupabaseServerClient();
    await appendAuditLog(supabase, {
      entityType: "profile",
      entityId: data.user.id,
      action: "create_user",
      metadata: { email: parsed.data.email, role: parsed.data.role },
    });

    revalidatePath("/equipe");
    revalidatePath("/agenda");
    return { ok: true, data: { userId: data.user.id } };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateTeamMemberProfile(
  raw: unknown,
): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const parsed = updateTeamMemberSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    const birthDate = parsed.data.birthDate ?? null;
    const color = normalizeHex(parsed.data.calendarColor);

    const service = createSupabaseServiceRoleClient();
    const { error } = await service
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        calendar_color: color,
        birth_date: birthDate,
      })
      .eq("id", parsed.data.userId);

    if (error) throw error;

    const supabase = await createSupabaseServerClient();
    await appendAuditLog(supabase, {
      entityType: "profile",
      entityId: parsed.data.userId,
      action: "update_profile",
      metadata: {},
    });

    revalidatePath("/equipe");
    revalidatePath("/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteTeamMember(raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const parsed = deleteTeamMemberSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    const targetId = parsed.data.userId;
    if (targetId === ctx.userId) {
      return { ok: false, error: "Não é possível excluir a si mesmo." };
    }

    const service = createSupabaseServiceRoleClient();
    const actorId = ctx.userId;

    const { error: e1 } = await service
      .from("events")
      .update({ created_by: actorId })
      .eq("created_by", targetId);
    if (e1) throw e1;

    const { error: e2 } = await service
      .from("clients")
      .update({ created_by: actorId })
      .eq("created_by", targetId);
    if (e2) throw e2;

    const { error: e3 } = await service
      .from("audit_logs")
      .update({ actor_id: actorId })
      .eq("actor_id", targetId);
    if (e3) throw e3;

    const { error: delAuth } = await service.auth.admin.deleteUser(targetId);
    if (delAuth) throw delAuth;

    const supabase = await createSupabaseServerClient();
    await appendAuditLog(supabase, {
      entityType: "profile",
      entityId: targetId,
      action: "delete_user",
      metadata: { deletedBy: actorId },
    });

    revalidatePath("/equipe");
    revalidatePath("/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function setUserPassword(raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const parsed = setPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    const service = createSupabaseServiceRoleClient();
    const { error } = await service.auth.admin.updateUserById(
      parsed.data.userId,
      { password: parsed.data.newPassword },
    );
    if (error) throw error;

    const supabase = await createSupabaseServerClient();
    await appendAuditLog(supabase, {
      entityType: "profile",
      entityId: parsed.data.userId,
      action: "reset_password",
      metadata: {},
    });

    revalidatePath("/equipe");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);
    if (userId === ctx.userId) {
      return { ok: false, error: "Não é possível alterar o próprio papel." };
    }
    const service = createSupabaseServiceRoleClient();
    const { error } = await service
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (error) throw error;

    const supabase = await createSupabaseServerClient();
    await appendAuditLog(supabase, {
      entityType: "profile",
      entityId: userId,
      action: "set_role",
      metadata: { role },
    });

    revalidatePath("/equipe");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateUserAccess(raw: unknown): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireUserManager(ctx);

    const parsed = promoteSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.flatten().formErrors.join(", ") };
    }

    if (parsed.data.userId === ctx.userId) {
      return { ok: false, error: "Não é possível alterar o próprio papel aqui." };
    }

    const service = createSupabaseServiceRoleClient();
    const updates = {
      can_manage_users: parsed.data.canManageUsers,
    };

    const { error } = await service
      .from("profiles")
      .update(updates)
      .eq("id", parsed.data.userId);

    if (error) throw error;

    const supabase = await createSupabaseServerClient();
    await appendAuditLog(supabase, {
      entityType: "profile",
      entityId: parsed.data.userId,
      action: "update_access",
      metadata: updates,
    });

    revalidatePath("/equipe");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
