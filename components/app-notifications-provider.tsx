"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  listMyNotifications,
  markAllMyNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";
import { NotificationBellUI } from "@/components/notification-bell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/types/database";

type AppNotificationsContextValue = {
  items: NotificationRow[];
  open: boolean;
  unreadCount: number;
  handleOpenToggle: () => void;
  handleRead: (id: string) => void;
};

const AppNotificationsContext =
  createContext<AppNotificationsContextValue | null>(null);

type AppNotificationsProviderProps = {
  userId: string;
  initialNotifications: NotificationRow[];
  children: React.ReactNode;
};

export function AppNotificationsProvider({
  userId,
  initialNotifications,
  children,
}: AppNotificationsProviderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>(initialNotifications);

  const refetch = useCallback(async () => {
    const res = await listMyNotifications();
    if (res.ok && res.data) setItems(res.data);
  }, []);

  useEffect(() => {
    setItems(initialNotifications);
  }, [initialNotifications]);

  useEffect(() => {
    void refetch();
  }, [pathname, refetch]);

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
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  const unreadCount = useMemo(
    () => items.reduce((acc, item) => acc + (item.is_read ? 0 : 1), 0),
    [items],
  );

  const handleOpenToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setItems((current) => {
          const hasUnread = current.some((n) => !n.is_read);
          if (hasUnread) {
            void markAllMyNotificationsRead();
            return current.map((n) => ({ ...n, is_read: true }));
          }
          return current;
        });
      }
      return next;
    });
  }, []);

  const handleRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    void markNotificationRead(id);
  }, []);

  const value = useMemo(
    () => ({
      items,
      open,
      unreadCount,
      handleOpenToggle,
      handleRead,
    }),
    [items, open, unreadCount, handleOpenToggle, handleRead],
  );

  return (
    <AppNotificationsContext.Provider value={value}>
      {children}
    </AppNotificationsContext.Provider>
  );
}

export function AppNotificationsBell() {
  const ctx = useContext(AppNotificationsContext);
  if (!ctx) {
    throw new Error(
      "AppNotificationsBell must be used within AppNotificationsProvider",
    );
  }

  return (
    <NotificationBellUI
      items={ctx.items}
      open={ctx.open}
      unreadCount={ctx.unreadCount}
      onToggle={ctx.handleOpenToggle}
      onRead={ctx.handleRead}
    />
  );
}
