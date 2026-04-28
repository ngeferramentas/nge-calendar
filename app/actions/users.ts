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
import type { ProfileRow, UserRole } from "@/lib/types/database";
import { z } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(300),
  role: z.enum(["admin", "collaborator"]).default("collaborator"),
});

const setPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8),
});

const promoteSchema = z.object({
  userId: z.string().uuid(),
  canManageUsers: z.boolean(),
});

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

export async function listCollaborators(): Promise<
  ActionResult<{ id: string; full_name: string }[]>
> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };
    requireAdmin(ctx);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "collaborator")
      .order("full_name");

    if (error) throw error;
    return { ok: true, data: (data ?? []) as { id: string; full_name: string }[] };
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

    const { error: pe } = await service
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        role: parsed.data.role as UserRole,
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
    return { ok: true, data: { userId: data.user.id } };
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
