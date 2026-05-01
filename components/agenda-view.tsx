"use client";

import { useState } from "react";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import type {
  CollaboratorCalendarMeta,
  EventRow,
  UserRole,
} from "@/lib/types/database";

type Props = {
  access: UserRole;
  userId: string;
  initialEvents: EventRow[];
  collaborators: { id: string; full_name: string; calendar_color: string }[];
  collaboratorMeta: CollaboratorCalendarMeta[];
};

export function AgendaView({
  access,
  userId,
  initialEvents,
  collaborators,
  collaboratorMeta,
}: Props) {
  const [filterId, setFilterId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {access === "admin" && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="collab-filter" className="text-sm text-zinc-600">
            Visão:
          </label>
          <select
            id="collab-filter"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            value={filterId ?? ""}
            onChange={(e) =>
              setFilterId(e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">Todos os eventos</option>
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>
                Agenda: {c.full_name || c.id}
              </option>
            ))}
          </select>
        </div>
      )}
      <ScheduleCalendar
        access={access}
        userId={userId}
        initialEvents={initialEvents}
        collaborators={collaborators}
        collaboratorMeta={collaboratorMeta}
        collaboratorFilterId={filterId}
        onEventCreated={(assignedCollaboratorId) => {
          setFilterId((fid) =>
            fid !== null && fid !== assignedCollaboratorId ? null : fid,
          );
        }}
      />
    </div>
  );
}
