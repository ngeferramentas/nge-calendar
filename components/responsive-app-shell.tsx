"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { SidebarCollaboratorLayers } from "@/components/sidebar-collaborator-layers";
import {
  BellRing,
  Calendar,
  ListTodo,
  LogOut,
  Menu,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

function navLinkClass(active: boolean): string {
  return active
    ? "flex items-center gap-2 rounded-lg px-3 py-2 bg-[#4285F4]/10 font-medium text-[#4285F4]"
    : "flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-700 hover:bg-zinc-50";
}

type ResponsiveAppShellProps = {
  roleLabel: string;
  userHeading: string;
  notifications: React.ReactNode;
  children: React.ReactNode;
  isAdmin: boolean;
  canManage: boolean;
};

export function ResponsiveAppShell({
  roleLabel,
  userHeading,
  notifications,
  children,
  isAdmin,
  canManage,
}: ResponsiveAppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="flex min-h-screen bg-white text-zinc-900">
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar-nav"
        className={`flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-6 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          drawerOpen
            ? "fixed inset-y-0 left-0 z-50 translate-x-0"
            : "fixed inset-y-0 left-0 z-50 -translate-x-full md:translate-x-0"
        }`}
      >
        <div className="mb-8 px-2 text-sm font-semibold text-[#4285F4]">
          NGE Calendar
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <Link
            href="/agenda"
            className={navLinkClass(pathname === "/agenda")}
            onClick={() => setDrawerOpen(false)}
          >
            <Calendar className="h-4 w-4" />
            Agenda
          </Link>
          <Link
            href="/tarefas"
            className={navLinkClass(pathname === "/tarefas")}
            onClick={() => setDrawerOpen(false)}
          >
            <ListTodo className="h-4 w-4" />
            Tarefas
          </Link>
          {isAdmin ? (
            <Link
              href="/clientes"
              className={navLinkClass(pathname === "/clientes")}
              onClick={() => setDrawerOpen(false)}
            >
              <Users className="h-4 w-4" />
              Clientes
            </Link>
          ) : null}
          {canManage ? (
            <Link
              href="/acoes"
              className={navLinkClass(pathname === "/acoes")}
              onClick={() => setDrawerOpen(false)}
            >
              <BellRing className="h-4 w-4" />
              Ações
            </Link>
          ) : null}
          {canManage ? (
            <Link
              href="/equipe"
              className={navLinkClass(pathname === "/equipe")}
              onClick={() => setDrawerOpen(false)}
            >
              <UserCog className="h-4 w-4" />
              Equipe
            </Link>
          ) : null}
          {isAdmin ? <SidebarCollaboratorLayers /> : null}
        </nav>

        <form action={signOut} className="mt-4 border-t border-zinc-100 pt-4">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg bg-[#FF0000] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 text-zinc-700 hover:bg-zinc-100 md:hidden"
              aria-expanded={drawerOpen}
              aria-controls="app-sidebar-nav"
              onClick={() => setDrawerOpen((o) => !o)}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {roleLabel}
              </p>
              <h1 className="truncate text-lg font-semibold text-zinc-900">
                {userHeading}
              </h1>
            </div>
          </div>
          {notifications}
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
