"use client";

import "temporal-polyfill/global";

import {
  ScheduleXCalendar,
  useNextCalendarApp,
} from "@schedule-x/react";
import {
  viewWeek,
  viewDay,
  type CalendarEvent,
  type CalendarType,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveAndAssignEvent,
  createEvent,
  listEventsForUser,
  rejectEvent,
  updateEvent,
} from "@/app/actions/events";
import type { EventRow, EventStatus, UserRole } from "@/lib/types/database";
import { eventStatusColor, EVENT_STATUS_LABELS } from "@/lib/types/database";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ClientCombobox } from "@/components/client-combobox";
import type { ClientRow } from "@/lib/types/database";
import { X } from "lucide-react";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Sao_Paulo";

function calendarsByAccess(access: UserRole): Record<string, CalendarType> {
  const readonly = access === "collaborator";
  const base = (main: string, container: string, on: string): CalendarType => ({
    colorName: "custom",
    lightColors: { main, container, onContainer: on },
    darkColors: { main, container, onContainer: on },
    readonly,
  });

  return {
    pending_approval: base("#F4B400", "#FFF8E1", "#333"),
    approved: base("#4285F4", "#E8F0FE", "#333"),
    confirmed: base("#4285F4", "#E8F0FE", "#333"),
    assigned: base("#0F9D58", "#E6F4EA", "#333"),
    rejected: base("#DB4437", "#FDECEA", "#333"),
  };
}

function toZdt(iso: string) {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(TZ);
}

function zdtToIso(z: Temporal.ZonedDateTime | Temporal.PlainDate): string {
  if (z instanceof Temporal.ZonedDateTime) {
    return z.toInstant().toString();
  }
  return Temporal.ZonedDateTime.from({
    year: z.year,
    month: z.month,
    day: z.day,
    hour: 0,
    minute: 0,
    second: 0,
    timeZone: TZ,
  })
    .toInstant()
    .toString();
}

function mapRowsToCalendarEvents(rows: EventRow[]): CalendarEvent[] {
  return rows.map((e) => {
    const clientLabel = e.clients?.full_name
      ? `${e.clients.full_name} (${e.clients.document_normalized})`
      : e.client_id;
    const title =
      e.title?.trim() ||
      `${EVENT_STATUS_LABELS[e.status]} · ${clientLabel}`;
    return {
      id: e.id,
      title,
      start: toZdt(e.starts_at),
      end: toZdt(e.ends_at),
      calendarId: e.status,
      description: e.description,
    };
  });
}

type Props = {
  access: UserRole;
  userId: string;
  initialEvents: EventRow[];
  collaborators: { id: string; full_name: string }[];
  collaboratorFilterId?: string | null;
};

export function ScheduleCalendar({
  access,
  userId,
  initialEvents,
  collaborators,
  collaboratorFilterId = null,
}: Props) {
  const [rows, setRows] = useState<EventRow[]>(initialEvents);
  const [banner, setBanner] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState<EventRow | null>(null);
  const [assignId, setAssignId] = useState<string>("");

  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formClient, setFormClient] = useState<ClientRow | null>(null);
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const rowsRef = useRef(rows);
  const skipFilterRefresh = useRef(true);

  const refresh = useCallback(async () => {
    const res = await listEventsForUser({
      collaboratorFilterId:
        access === "admin" ? collaboratorFilterId : undefined,
    });
    if (res.ok && res.data) setRows(res.data);
  }, [access, collaboratorFilterId]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const serverSig = useMemo(
    () =>
      initialEvents
        .map((e) => `${e.id}:${e.starts_at}:${e.status}:${e.collaborator_id ?? ""}`)
        .join("|"),
    [initialEvents],
  );
  const [lastServerSig, setLastServerSig] = useState(serverSig);
  if (serverSig !== lastServerSig) {
    setLastServerSig(serverSig);
    setRows(initialEvents);
  }

  useEffect(() => {
    if (skipFilterRefresh.current) {
      skipFilterRefresh.current = false;
      return;
    }
    void refresh();
  }, [collaboratorFilterId, refresh]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("events-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        (payload) => {
          void refresh();
          const next = payload.new as { collaborator_id?: string } | null;
          if (
            payload.eventType === "UPDATE" &&
            next?.collaborator_id === userId
          ) {
            setBanner("Um evento foi atribuído a você.");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const calendars = useMemo(() => calendarsByAccess(access), [access]);

  const calendarApp = useNextCalendarApp({
    theme: "default",
    timezone: TZ,
    views: [viewWeek, viewDay],
    calendars,
    events: [],
    selectedDate: Temporal.Now.plainDateISO(),
    weekOptions: {
      gridStep: 30,
      nDays: 7,
      gridHeight: 1600,
      eventWidth: 95,
      timeAxisFormatOptions: { hour: "2-digit", minute: "2-digit" },
      eventOverlap: true,
    },
    callbacks: {
      onEventClick: (calEvent) => {
        const row = rowsRef.current.find((r) => r.id === String(calEvent.id));
        if (!row) return;
        if (access === "admin" && row.status === "pending_approval") {
          setAdminOpen(row);
          setAssignId(collaborators[0]?.id ?? "");
        }
      },
      onBeforeEventUpdate: () => access === "admin",
      onEventUpdate: async (calEvent) => {
        if (access !== "admin") return;
        const id = String(calEvent.id);
        const starts = zdtToIso(calEvent.start);
        const ends = zdtToIso(calEvent.end);
        const res = await updateEvent({ id, startsAt: starts, endsAt: ends });
        if (!res.ok) {
          alert(res.error);
          await refresh();
          return;
        }
        await refresh();
      },
    },
  });

  useEffect(() => {
    if (!calendarApp) return;
    calendarApp.events.set(mapRowsToCalendarEvents(rows));
  }, [calendarApp, rows]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formClient) {
      alert("Selecione um cliente.");
      return;
    }
    if (!formStart || !formEnd) {
      alert("Informe início e fim.");
      return;
    }
    const startIso = new Date(formStart).toISOString();
    const endIso = new Date(formEnd).toISOString();
    setSaving(true);
    const res = await createEvent({
      title: formTitle,
      description: formDesc,
      clientId: formClient.id,
      startsAt: startIso,
      endsAt: endIso,
    });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setCreateOpen(false);
    setFormTitle("");
    setFormDesc("");
    setFormClient(null);
    await refresh();
  }

  async function handleApprove() {
    if (!adminOpen || !assignId) return;
    setSaving(true);
    const res = await approveAndAssignEvent({
      eventId: adminOpen.id,
      collaboratorId: assignId,
    });
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setAdminOpen(null);
    await refresh();
  }

  async function handleReject() {
    if (!adminOpen) return;
    setSaving(true);
    const res = await rejectEvent(adminOpen.id);
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setAdminOpen(null);
    await refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {banner && (
        <div className="flex items-center justify-between rounded-lg border border-[#F4B400] bg-[#FFF8E1] px-4 py-2 text-sm text-zinc-800">
          {banner}
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setBanner(null)}
            className="rounded p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
        >
          Novo evento
        </button>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
          {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: eventStatusColor(s) }}
              />
              {EVENT_STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-[720px] w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-sm [&_.sx__calendar-wrapper]:min-h-[680px]">
        {calendarApp && <ScheduleXCalendar calendarApp={calendarApp} />}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">
              Novo evento
            </h2>
            <div className="space-y-3">
              <ClientCombobox
                value={formClient}
                onChange={setFormClient}
                disabled={saving}
              />
              <div>
                <label className="mb-1 block text-sm font-medium">Título</label>
                <input
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Descrição
                </label>
                <textarea
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Início
                  </label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Fim</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#0F9D58] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Criar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {adminOpen && access === "admin" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">
              Aprovar evento
            </h2>
            <p className="mb-4 text-sm text-zinc-600">
              Pendente de aprovação. Atribua a um colaborador.
            </p>
            <label className="mb-1 block text-sm font-medium">
              Colaborador
            </label>
            <select
              className="mb-4 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={assignId}
              onChange={(e) => setAssignId(e.target.value)}
            >
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.id}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                onClick={() => setAdminOpen(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#DB4437] px-4 py-2 text-sm text-white"
                onClick={() => void handleReject()}
                disabled={saving}
              >
                Rejeitar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white"
                onClick={() => void handleApprove()}
                disabled={saving || !assignId}
              >
                Aprovar e atribuir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
