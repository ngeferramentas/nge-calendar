"use client";

import { useCollaboratorVisibility } from "@/components/collaborator-visibility-context";

function safeCalendarColor(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  return /^#[0-9A-Fa-f]{6}$/i.test(t) ? t : "#4285F4";
}

export function SidebarCollaboratorLayers() {
  const ctx = useCollaboratorVisibility();
  if (!ctx || ctx.members.length === 0) return null;

  const { members, isVisible, toggle } = ctx;

  return (
    <div className="mt-6 border-t border-zinc-100 pt-4">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Colaboradores
      </p>
      <ul className="flex max-h-[min(40vh,320px)] flex-col gap-1 overflow-y-auto pr-1">
        {members.map((m) => {
          const checked = isVisible(m.id);
          const color = safeCalendarColor(m.calendar_color);
          const label = m.full_name?.trim() || m.id;
          return (
            <li key={m.id}>
              <label
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                title={label}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-[#4285F4] focus:ring-[#4285F4]"
                  aria-label={`Mostrar agenda de ${label}`}
                />
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
