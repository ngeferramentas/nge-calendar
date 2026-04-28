import { listTeamProfiles } from "@/app/actions/users";
import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { EquipeAdmin } from "@/components/equipe-admin";

export default async function EquipePage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");
  if (ctx.profile.role !== "admin" || !ctx.profile.can_manage_users) {
    redirect("/agenda");
  }

  const res = await listTeamProfiles();
  const rows = res.ok ? res.data ?? [] : [];

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-zinc-900">
        Gestão de equipe
      </h2>
      <EquipeAdmin initialProfiles={rows} currentUserId={ctx.userId} />
    </div>
  );
}
