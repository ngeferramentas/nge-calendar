"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listMyNotifications,
  markAllMyNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/types/database";
import { formatDateTimePtBr } from "@/lib/format/locale";
import { Bell } from "lucide-react";

type Props = {
  userId: string;
  initialNotifications: NotificationRow[];
};

export function NotificationBell({ userId, initialNotifications }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void (async () => {
            const res = await listMyNotifications();
            if (res.ok && res.data) setItems(res.data);
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = useMemo(
    () => items.reduce((acc, item) => acc + (item.is_read ? 0 : 1), 0),
    [items],
  );

  async function handleOpenToggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await markAllMyNotificationsRead();
    }
  }

  async function handleRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await markNotificationRead(id);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleOpenToggle()}
        className="relative rounded-lg border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#DB4437] px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Notificações
          </p>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-4 text-sm text-zinc-500">
                Sem notificações no momento.
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleRead(item.id)}
                  className={`mb-1 w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-50 ${
                    item.is_read ? "text-zinc-600" : "bg-zinc-50 text-zinc-900"
                  }`}
                >
                  <p>{item.message}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDateTimePtBr(item.created_at)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
