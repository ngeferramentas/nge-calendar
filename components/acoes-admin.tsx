"use client";

import { useMemo, useState } from "react";
import {
  approveAndAssignEvent,
  rejectEvent,
  type ActionResult as EventActionResult,
} from "@/app/actions/events";
import { deleteMyNotification } from "@/app/actions/notifications";
import type { EventRow, NotificationRow } from "@/lib/types/database";
import { EVENT_STATUS_LABELS } from "@/lib/types/database";

type CollaboratorOption = { id: string; full_name: string; calendar_color?: string };

type Props = {
  initialPendingEvents: EventRow[];
  initialNotifications: NotificationRow[];
  collaborators: CollaboratorOption[];
};

export function AcoesAdmin({
  initialPendingEvents,
  initialNotifications,
  collaborators,
}: Props) {
  const [pendingEvents, setPendingEvents] = useState(initialPendingEvents);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [assignByEventId, setAssignByEventId] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const defaultCollaboratorId = collaborators[0]?.id ?? "";

  const pendingSorted = useMemo(
    () =>
      [...pendingEvents].sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      ),
    [pendingEvents],
  );

  async function runAction(eventId: string, job: () => Promise<EventActionResult>) {
    setSavingId(eventId);
    const res = await job();
    setSavingId(null);
    if (!res.ok) {
      alert(res.error);
      return false;
    }
    setPendingEvents((prev) => prev.filter((event) => event.id !== eventId));
    return true;
  }

  async function handleApprove(event: EventRow) {
    const collaboratorId = assignByEventId[event.id] || defaultCollaboratorId;
    if (!collaboratorId) {
      alert("Selecione um colaborador.");
      return;
    }
    await runAction(event.id, () =>
      approveAndAssignEvent({
        eventId: event.id,
        collaboratorId,
      }),
    );
  }

  async function handleReject(event: EventRow) {
    await runAction(event.id, () => rejectEvent(event.id));
  }

  async function handleDeleteNotification(id: string) {
    const res = await deleteMyNotification(id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-zinc-900">
          Pendências de aprovação
        </h3>
        {pendingSorted.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem pendências no momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Cliente</th>
                  <th className="px-2 py-2 font-medium">Início</th>
                  <th className="px-2 py-2 font-medium">Fim</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Colaborador</th>
                  <th className="px-2 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendingSorted.map((event) => {
                  const currentAssign =
                    assignByEventId[event.id] || event.collaborator_id || defaultCollaboratorId;
                  const assignedProfile = collaborators.find((c) => c.id === currentAssign);
                  const badgeColor = assignedProfile?.calendar_color ?? "#4285F4";
                  return (
                    <tr key={event.id} className="border-t border-zinc-100">
                      <td className="px-2 py-2">
                        {event.clients?.full_name ?? event.client_id}
                      </td>
                      <td className="px-2 py-2">
                        {new Date(event.starts_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-2 py-2">
                        {new Date(event.ends_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-2 py-2">
                        {EVENT_STATUS_LABELS[event.status]}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: badgeColor }}
                          />
                          <select
                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm"
                            value={currentAssign}
                            onChange={(e) =>
                              setAssignByEventId((prev) => ({
                                ...prev,
                                [event.id]: e.target.value,
                              }))
                            }
                          >
                            {collaborators.map((collab) => (
                              <option key={collab.id} value={collab.id}>
                                {collab.full_name || collab.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReject(event)}
                            disabled={savingId === event.id}
                            className="rounded-lg bg-[#DB4437] px-3 py-1.5 text-white disabled:opacity-50"
                          >
                            Recusar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleApprove(event)}
                            disabled={savingId === event.id || !currentAssign}
                            className="rounded-lg bg-[#4285F4] px-3 py-1.5 text-white disabled:opacity-50"
                          >
                            Aprovar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold text-zinc-900">
          Mensagens e alertas recebidos
        </h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem mensagens no momento.</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-zinc-900">{item.message}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteNotification(item.id)}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
