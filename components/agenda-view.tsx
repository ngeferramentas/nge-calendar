"use client";

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
  return (
    <div className="space-y-4">
      <ScheduleCalendar
        access={access}
        userId={userId}
        initialEvents={initialEvents}
        collaborators={collaborators}
        collaboratorMeta={collaboratorMeta}
      />
    </div>
  );
}
