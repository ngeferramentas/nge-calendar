import {
  listPendingApprovalEvents,
  listPendingEventEditRequests,
} from "@/app/actions/events";
import { listMyNotificationsPage } from "@/app/actions/notifications";
import { listCollaborators } from "@/app/actions/users";
import { AcoesAdmin } from "@/components/acoes-admin";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function AcoesPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");
  if (ctx.profile.role !== "admin" || !ctx.profile.can_manage_users) {
    redirect("/agenda");
  }

  const [pendingRes, editPendingRes, notificationsRes, collaboratorsRes] =
    await Promise.all([
      listPendingApprovalEvents(),
      listPendingEventEditRequests(),
      listMyNotificationsPage(),
      listCollaborators(),
    ]);

  return (
    <div>
      <PageHeader title="Ações" />
      <AcoesAdmin
        initialPendingEvents={pendingRes.ok ? pendingRes.data ?? [] : []}
        initialPendingEditRequests={
          editPendingRes.ok ? editPendingRes.data ?? [] : []
        }
        initialNotifications={
          notificationsRes.ok ? notificationsRes.data ?? [] : []
        }
        collaborators={collaboratorsRes.ok ? collaboratorsRes.data ?? [] : []}
      />
    </div>
  );
}
