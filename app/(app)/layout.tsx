import { redirect } from "next/navigation";
import { listMyNotifications } from "@/app/actions/notifications";
import { listCollaboratorCalendarMeta } from "@/app/actions/users";
import { AppNotificationsProvider } from "@/components/app-notifications-provider";
import { CollaboratorVisibilityProvider } from "@/components/collaborator-visibility-context";
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
    <AppNotificationsProvider
      userId={ctx.userId}
      initialNotifications={
        notificationsRes.ok ? notificationsRes.data ?? [] : []
      }
    >
      <ResponsiveAppShell
        userHeading={ctx.profile.full_name || ctx.email || "—"}
        isAdmin={isAdmin}
        canManage={canManage}
      >
        {children}
      </ResponsiveAppShell>
    </AppNotificationsProvider>
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
