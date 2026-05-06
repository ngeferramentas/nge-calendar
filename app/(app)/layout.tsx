import { redirect } from "next/navigation";
import { listMyNotifications } from "@/app/actions/notifications";
import { listCollaboratorCalendarMeta } from "@/app/actions/users";
import { CollaboratorVisibilityProvider } from "@/components/collaborator-visibility-context";
import { NotificationBell } from "@/components/notification-bell";
import { ResponsiveAppShell } from "@/components/responsive-app-shell";
import type { CollaboratorCalendarMeta } from "@/lib/types/database";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/");
  const notificationsRes = await listMyNotifications();

  const isAdmin = ctx.profile.role === "admin";
  const canManage = isAdmin && ctx.profile.can_manage_users;

  let collaboratorMetaSidebar: CollaboratorCalendarMeta[] = [];
  if (isAdmin) {
    const metaRes = await listCollaboratorCalendarMeta();
    collaboratorMetaSidebar = metaRes.ok ? metaRes.data ?? [] : [];
  }

  const shell = (
    <ResponsiveAppShell
      roleLabel={
        ctx.profile.role === "admin" ? "Administrador" : "Colaborador"
      }
      userHeading={ctx.profile.full_name || ctx.email || "—"}
      isAdmin={isAdmin}
      canManage={canManage}
      notifications={
        <NotificationBell
          userId={ctx.userId}
          initialNotifications={
            notificationsRes.ok ? notificationsRes.data ?? [] : []
          }
        />
      }
    >
      {children}
    </ResponsiveAppShell>
  );

  if (isAdmin) {
    return (
      <CollaboratorVisibilityProvider
        userId={ctx.userId}
        members={collaboratorMetaSidebar}
      >
        {shell}
      </CollaboratorVisibilityProvider>
    );
  }

  return shell;
}
