import { listMyTasks } from "@/app/actions/tasks";
import { listCollaborators } from "@/app/actions/users";
import { TarefasView } from "@/components/tarefas-view";
import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function TarefasPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");

  const tasksRes = await listMyTasks();
  const collaboratorsRes =
    ctx.profile.role === "admin"
      ? await listCollaborators()
      : { ok: true as const, data: [] };

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-zinc-900">Tarefas</h2>
      <TarefasView
        userId={ctx.userId}
        isAdmin={ctx.profile.role === "admin"}
        initialTasks={tasksRes.ok ? tasksRes.data ?? [] : []}
        collaborators={collaboratorsRes.ok ? collaboratorsRes.data ?? [] : []}
      />
    </div>
  );
}
