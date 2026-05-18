"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeTask,
  createTask,
  deleteTask,
  updateTask,
} from "@/app/actions/tasks";
import type { TaskRow } from "@/lib/types/database";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

type CollaboratorOption = {
  id: string;
  full_name: string;
};

type TarefasViewProps = {
  userId: string;
  isAdmin: boolean;
  initialTasks: TaskRow[];
  collaborators: CollaboratorOption[];
};

function taskMeta(
  task: TaskRow,
  userId: string,
): { label: string; tone: "self" | "assigned" | "created" } {
  const creatorName = task.creator_profile?.full_name ?? "—";
  const assigneeName = task.assignee_profile?.full_name ?? "—";

  if (task.created_by === userId && task.assignee_id === userId) {
    return { label: "Para você", tone: "self" };
  }
  if (task.created_by === userId && task.assignee_id !== userId) {
    return { label: `Atribuída a ${assigneeName}`, tone: "created" };
  }
  if (task.assignee_id === userId && task.created_by !== userId) {
    return { label: `De ${creatorName}`, tone: "assigned" };
  }
  return { label: `${creatorName} → ${assigneeName}`, tone: "self" };
}

export function TarefasView({
  userId,
  isAdmin,
  initialTasks,
  collaborators,
}: TarefasViewProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(userId);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState(userId);

  const assigneeOptions: CollaboratorOption[] = isAdmin
    ? [
        { id: userId, full_name: "Eu" },
        ...collaborators.filter((c) => c.id !== userId),
      ]
    : [{ id: userId, full_name: "Eu" }];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 2) return;
    setBusy(true);
    const res = await createTask({
      title: trimmed,
      assigneeId: isAdmin ? assigneeId : userId,
    });
    setBusy(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setTitle("");
    setAssigneeId(userId);
    router.refresh();
  }

  async function handleComplete(task: TaskRow) {
    setBusy(true);
    const res = await completeTask(task.id);
    setBusy(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(task: TaskRow) {
    const ok = window.confirm(`Excluir a tarefa "${task.title}"?`);
    if (!ok) return;
    setBusy(true);
    const res = await deleteTask(task.id);
    setBusy(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  function startEdit(task: TaskRow) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditAssigneeId(task.assignee_id);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditAssigneeId(userId);
  }

  async function handleSaveEdit(taskId: string) {
    const trimmed = editTitle.trim();
    if (trimmed.length < 2) return;
    setBusy(true);
    const res = await updateTask({
      taskId,
      title: trimmed,
      ...(isAdmin ? { assigneeId: editAssigneeId } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    cancelEdit();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="new-task-title" className="mb-1 block text-xs font-medium text-zinc-500">
              Nova tarefa
            </label>
            <input
              id="new-task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              disabled={busy}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4285F4] focus:ring-1 focus:ring-[#4285F4]"
            />
          </div>
          {isAdmin ? (
            <div className="w-full sm:w-48">
              <label htmlFor="new-task-assignee" className="mb-1 block text-xs font-medium text-zinc-500">
                Responsável
              </label>
              <select
                id="new-task-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4285F4]"
              >
                {assigneeOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy || title.trim().length < 2}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      </form>

      {initialTasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
          Nenhuma tarefa pendente. Adicione uma acima.
        </p>
      ) : (
        <ul className="space-y-2">
          {initialTasks.map((task) => {
            const meta = taskMeta(task, userId);
            const isEditing = editingId === task.id;

            return (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-sm"
              >
                <button
                  type="button"
                  disabled={busy || isEditing}
                  onClick={() => void handleComplete(task)}
                  aria-label={`Concluir ${task.title}`}
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 text-zinc-400 hover:border-[#4285F4] hover:text-[#4285F4] disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        disabled={busy}
                        className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-[#4285F4]"
                      />
                      {isAdmin ? (
                        <select
                          value={editAssigneeId}
                          onChange={(e) => setEditAssigneeId(e.target.value)}
                          disabled={busy}
                          className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                        >
                          {assigneeOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.full_name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy || editTitle.trim().length < 2}
                          onClick={() => void handleSaveEdit(task.id)}
                          className="rounded-lg bg-[#4285F4] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1 text-xs text-zinc-600"
                        >
                          <X className="h-3 w-3" />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-zinc-900">{task.title}</p>
                      <span
                        className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${
                          meta.tone === "assigned"
                            ? "bg-[#4285F4]/10 text-[#4285F4]"
                            : meta.tone === "created"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {meta.label}
                      </span>
                    </>
                  )}
                </div>

                {!isEditing ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(task)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-50"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(task)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
