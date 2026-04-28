import { listEventsForUser } from "@/app/actions/events";
import { listCollaborators } from "@/app/actions/users";
import { AgendaView } from "@/components/agenda-view";
import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function AgendaPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");

  const eventsRes = await listEventsForUser({});
  const collaboratorsRes =
    ctx.profile.role === "admin" ? await listCollaborators() : { ok: true as const, data: [] };

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-zinc-900">Agenda</h2>
      <AgendaView
        access={ctx.profile.role}
        userId={ctx.userId}
        initialEvents={eventsRes.ok ? eventsRes.data ?? [] : []}
        collaborators={
          collaboratorsRes.ok ? collaboratorsRes.data ?? [] : []
        }
      />
    </div>
  );
}
