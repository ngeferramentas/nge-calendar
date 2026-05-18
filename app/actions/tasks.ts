"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TaskRow } from "@/lib/types/database";
import {
  createTaskSchema,
  taskIdSchema,
  updateTaskSchema,
} from "@/lib/validations/tasks";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Erro desconhecido";
}

const TASK_SELECT =
  "*, creator_profile:profiles!tasks_created_by_fkey(full_name), assignee_profile:profiles!tasks_assignee_id_fkey(full_name)";

async function notifyTaskAssignment(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  recipientId: string;
  createdBy: string;
  title: string;
}): Promise<void> {
  if (params.recipientId === params.createdBy) return;
  const message = `Nova tarefa atribuída: ${params.title}`;
  await params.supabase.from("notifications").insert({
    recipient_id: params.recipientId,
    created_by: params.createdBy,
    event_id: null,
    message,
  });
}

async function notifyTaskCompletion(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  recipientId: string;
  createdBy: string;
  title: string;
}): Promise<void> {
  if (params.recipientId === params.createdBy) return;
  const message = `Tarefa concluída: ${params.title}`;
  await params.supabase.from("notifications").insert({
    recipient_id: params.recipientId,
    created_by: params.createdBy,
    event_id: null,
    message,
  });
}

async function assertValidAssignee(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  assigneeId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", assigneeId)
    .in("role", ["admin", "collaborator"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Responsável inválido.");
}

function revalidateTaskPaths(): void {
  revalidatePath("/tarefas");
  revalidatePath("/acoes");
}

export async function listMyTasks(): Promise<ActionResult<TaskRow[]>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { ok: true, data: (data ?? []) as TaskRow[] };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function createTask(input: {
  title: string;
  assigneeId?: string;
}): Promise<ActionResult<TaskRow>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = createTaskSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Dados inválidos." };

    const isAdmin = ctx.profile.role === "admin";
    let assigneeId = parsed.data.assigneeId ?? ctx.userId;

    if (!isAdmin) {
      assigneeId = ctx.userId;
    }

    const supabase = await createSupabaseServerClient();
    await assertValidAssignee(supabase, assigneeId);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: parsed.data.title,
        created_by: ctx.userId,
        assignee_id: assigneeId,
      })
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    const row = data as TaskRow;
    if (assigneeId !== ctx.userId) {
      await notifyTaskAssignment({
        supabase,
        recipientId: assigneeId,
        createdBy: ctx.userId,
        title: row.title,
      });
      revalidateTaskPaths();
    } else {
      revalidatePath("/tarefas");
    }

    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateTask(input: {
  taskId: string;
  title: string;
  assigneeId?: string;
}): Promise<ActionResult<TaskRow>> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = updateTaskSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Dados inválidos." };

    const isAdmin = ctx.profile.role === "admin";
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: fetchErr } = await supabase
      .from("tasks")
      .select("id, created_by, assignee_id, title")
      .eq("id", parsed.data.taskId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return { ok: false, error: "Tarefa não encontrada." };

    const patch: { title: string; assignee_id?: string } = {
      title: parsed.data.title,
    };

    let notifyAssignee: string | null = null;

    if (parsed.data.assigneeId !== undefined) {
      if (!isAdmin) {
        return { ok: false, error: "Apenas administradores podem reatribuir tarefas." };
      }
      await assertValidAssignee(supabase, parsed.data.assigneeId);
      if (parsed.data.assigneeId !== existing.assignee_id) {
        patch.assignee_id = parsed.data.assigneeId;
        notifyAssignee = parsed.data.assigneeId;
      }
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", parsed.data.taskId)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    const row = data as TaskRow;
    if (notifyAssignee) {
      await notifyTaskAssignment({
        supabase,
        recipientId: notifyAssignee,
        createdBy: ctx.userId,
        title: row.title,
      });
      revalidateTaskPaths();
    } else {
      revalidatePath("/tarefas");
    }

    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function completeTask(taskId: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = taskIdSchema.safeParse({ taskId });
    if (!parsed.success) return { ok: false, error: "Tarefa inválida." };

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("tasks")
      .select("id, title, created_by, assignee_id")
      .eq("id", parsed.data.taskId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return { ok: false, error: "Tarefa não encontrada." };

    const shouldNotifyCreator =
      existing.assignee_id !== existing.created_by &&
      existing.assignee_id === ctx.userId;

    if (shouldNotifyCreator) {
      await notifyTaskCompletion({
        supabase,
        recipientId: existing.created_by,
        createdBy: ctx.userId,
        title: existing.title,
      });
    }

    const { error: deleteErr } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data.taskId);

    if (deleteErr) throw deleteErr;

    revalidateTaskPaths();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return { ok: false, error: "Não autenticado." };

    const parsed = taskIdSchema.safeParse({ taskId });
    if (!parsed.success) return { ok: false, error: "Tarefa inválida." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", parsed.data.taskId);

    if (error) throw error;

    revalidatePath("/tarefas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
