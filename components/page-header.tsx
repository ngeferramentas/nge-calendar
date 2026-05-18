"use client";

import { AppNotificationsBell } from "@/components/app-notifications-provider";

type PageHeaderProps = {
  title: string;
};

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
      <AppNotificationsBell />
    </div>
  );
}
