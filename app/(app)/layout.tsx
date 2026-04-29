import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { listMyNotifications } from "@/app/actions/notifications";
import { NotificationBell } from "@/components/notification-bell";

export const dynamic = "force-dynamic";
import { getSessionContext } from "@/lib/auth/session";
import { Calendar, LogOut, Users, UserCog } from "lucide-react";

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

  return (
    <div className="flex min-h-screen bg-white text-zinc-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-6">
        <div className="mb-8 px-2 text-sm font-semibold text-[#4285F4]">
          NGE Calendar
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <Link
            href="/agenda"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-50"
          >
            <Calendar className="h-4 w-4" />
            Agenda
          </Link>
          {isAdmin && (
            <Link
              href="/clientes"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-50"
            >
              <Users className="h-4 w-4" />
              Clientes
            </Link>
          )}
          {canManage && (
            <Link
              href="/equipe"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-50"
            >
              <UserCog className="h-4 w-4" />
              Equipe
            </Link>
          )}
        </nav>
        <form action={signOut} className="mt-4 border-t border-zinc-100 pt-4">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </form>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {ctx.profile.role === "admin" ? "Administrador" : "Colaborador"}
            </p>
            <h1 className="text-lg font-semibold text-zinc-900">
              {ctx.profile.full_name || ctx.email}
            </h1>
          </div>
          <NotificationBell
            userId={ctx.userId}
            initialNotifications={
              notificationsRes.ok ? notificationsRes.data ?? [] : []
            }
          />
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
