import { listTeamProfiles } from "@/app/actions/users";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader title="Gestão de equipe" />
      <EquipeAdmin initialProfiles={rows} currentUserId={ctx.userId} />
    </div>
  );
}
