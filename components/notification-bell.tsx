"use client";

import type { NotificationRow } from "@/lib/types/database";
import { formatDateTimePtBr } from "@/lib/format/locale";
import { Bell } from "lucide-react";

type NotificationBellUIProps = {
  items: NotificationRow[];
  open: boolean;
  unreadCount: number;
  onToggle: () => void;
  onRead: (id: string) => void;
};

export function NotificationBellUI({
  items,
  open,
  unreadCount,
  onToggle,
  onRead,
}: NotificationBellUIProps) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
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
                  onClick={() => onRead(item.id)}
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
