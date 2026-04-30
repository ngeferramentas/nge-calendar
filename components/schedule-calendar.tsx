"use client";

import "temporal-polyfill/global";

import {
  ScheduleXCalendar,
  useNextCalendarApp,
} from "@schedule-x/react";
import {
  viewWeek,
  viewDay,
  viewMonthGrid,
  type CalendarEvent,
  type CalendarType,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveAndAssignEvent,
  createEvent,
  deleteEvent,
  listEventsForUser,
  rejectEvent,
  updateEvent,
} from "@/app/actions/events";
import type {
  CollaboratorCalendarMeta,
  EventRow,
  EventStatus,
  UserRole,
} from "@/lib/types/database";
import { eventStatusColor, EVENT_STATUS_LABELS } from "@/lib/types/database";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ClientCombobox } from "@/components/client-combobox";
import { CollaboratorCombobox } from "@/components/collaborator-combobox";
import type { ClientRow } from "@/lib/types/database";
import { Trash2, X } from "lucide-react";

const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Sao_Paulo";

type BrasilApiHoliday = {
  date: string;
  name: string;
  type?: string;
};

type HolidayEntry = {
  date: string;
  name: string;
  source: "national" | "municipal";
};

const UBERLANDIA_MUNICIPAL_HOLIDAYS = [
  { monthDay: "08-31", name: "Aniversário de Uberlândia" },
] as const;

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
    holiday: {
      colorName: "holiday",
      lightColors: { main: "#7E57C2", container: "#F3E8FF", onContainer: "#2D1B45" },
      darkColors: { main: "#7E57C2", container: "#F3E8FF", onContainer: "#2D1B45" },
      readonly: true,
    },
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

function mixWithWhite(hex: string, ratio: number): string {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex.trim());
  if (!m) return "#E8F0FE";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  const R = mix(r);
  const G = mix(g);
  const B = mix(b);
  return `#${R.toString(16).padStart(2, "0")}${G.toString(16).padStart(2, "0")}${B.toString(16).padStart(2, "0")}`.toUpperCase();
}

function collaboratorCalendarFromHex(
  main: string,
  access: UserRole,
): CalendarType {
  const readonly = access === "collaborator";
  const container = mixWithWhite(main, 0.88);
  return {
    colorName: "custom",
    lightColors: { main, container, onContainer: "#333" },
    darkColors: { main, container, onContainer: "#333" },
    readonly,
  };
}

function eventCalendarId(e: EventRow): string {
  const hex = e.collaborator_profile?.calendar_color?.trim();
  if (
    e.collaborator_id &&
    hex &&
    /^#[0-9A-Fa-f]{6}$/i.test(hex)
  ) {
    return `collab_${e.collaborator_id}`;
  }
  return e.status;
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
      calendarId: eventCalendarId(e),
      description: e.description,
    };
  });
}

async function fetchNationalHolidays(year: number): Promise<HolidayEntry[]> {
  const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
  if (!resp.ok) return [];
  const data = (await resp.json()) as BrasilApiHoliday[];
  return data.map((h) => ({
    date: h.date,
    name: h.name,
    source: "national",
  }));
}

async function fetchUberlandiaHolidaysFromApi(year: number): Promise<HolidayEntry[]> {
  const endpoints = [
    `https://brasilapi.com.br/api/feriados/v1/${year}?uf=MG&city=Uberlandia`,
    `https://brasilapi.com.br/api/feriados/v1/${year}?state=MG&city=Uberlandia`,
  ];

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint);
      if (!resp.ok) continue;
      const data = (await resp.json()) as BrasilApiHoliday[];
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((h) => ({
        date: h.date,
        name: h.name,
        source: "municipal",
      }));
    } catch {
      // fallback below
    }
  }

  return UBERLANDIA_MUNICIPAL_HOLIDAYS.map((h) => ({
    date: `${year}-${h.monthDay}`,
    name: h.name,
    source: "municipal",
  }));
}

function holidayEntriesToCalendarEvents(entries: HolidayEntry[]): CalendarEvent[] {
  return entries.map((h) => {
    const day = Temporal.PlainDate.from(h.date);
    const start = Temporal.ZonedDateTime.from({
      year: day.year,
      month: day.month,
      day: day.day,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone: TZ,
    });
    const end = start.add({ days: 1 });
    const sourceLabel = h.source === "municipal" ? "Uberlândia/MG" : "Nacional";
    return {
      id: `holiday:${h.date}:${h.name}`,
      title: `Feriado (${sourceLabel}) · ${h.name}`,
      start,
      end,
      calendarId: "holiday",
      description: `Feriado ${sourceLabel}`,
    };
  });
}

function birthdayEntriesToCalendarEvents(
  meta: CollaboratorCalendarMeta[],
  years: number[],
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const m of meta) {
    if (!m.birth_date) continue;
    let orig: Temporal.PlainDate;
    try {
      orig = Temporal.PlainDate.from(m.birth_date.slice(0, 10));
    } catch {
      continue;
    }
    const month = orig.month;
    const day = orig.day;
    for (const year of years) {
      let date: Temporal.PlainDate;
      try {
        date = Temporal.PlainDate.from({ year, month, day });
      } catch {
        if (month === 2 && day === 29) {
          try {
            date = Temporal.PlainDate.from({ year, month: 2, day: 28 });
          } catch {
            continue;
          }
        } else {
          continue;
        }
      }
      const start = Temporal.ZonedDateTime.from({
        year: date.year,
        month: date.month,
        day: date.day,
        hour: 0,
        minute: 0,
        second: 0,
        timeZone: TZ,
      });
      const end = start.add({ days: 1 });
      out.push({
        id: `birthday:${m.id}:${year}`,
        title: `Aniversário · ${m.full_name}`,
        start,
        end,
        calendarId: `collab_${m.id}`,
        description: "Aniversário do colaborador",
      });
    }
  }
  return out;
}

type Props = {
  access: UserRole;
  userId: string;
  initialEvents: EventRow[];
  collaborators: { id: string; full_name: string; calendar_color?: string }[];
  collaboratorMeta: CollaboratorCalendarMeta[];
  collaboratorFilterId?: string | null;
};

export function ScheduleCalendar({
  access,
  userId,
  initialEvents,
  collaborators,
  collaboratorMeta,
  collaboratorFilterId = null,
}: Props) {
  const [rows, setRows] = useState<EventRow[]>(initialEvents);
  const [banner, setBanner] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState<EventRow | null>(null);
  const [detailOpen, setDetailOpen] = useState<EventRow | null>(null);
  const [assignId, setAssignId] = useState<string>("");

  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formClient, setFormClient] = useState<ClientRow | null>(null);
  const [formCollaborator, setFormCollaborator] = useState<{
    id: string;
    full_name: string;
  } | null>(null);
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [holidayEvents, setHolidayEvents] = useState<CalendarEvent[]>([]);
  const rowsRef = useRef(rows);
  const skipFilterRefresh = useRef(true);

  const refresh = useCallback(async () => {
    const res = await listEventsForUser({
      collaboratorFilterId:
        access === "admin" ? collaboratorFilterId : undefined,
    });
    if (!res.ok) {
      setBanner(res.error);
      return;
    }
    if (res.data) setRows(res.data);
  }, [access, collaboratorFilterId]);

  const formatDateTimePtBr = useCallback((iso: string) => {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }, []);

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
            (payload.eventType === "UPDATE" || payload.eventType === "INSERT") &&
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

  useEffect(() => {
    let active = true;
    const nowYear = Temporal.Now.plainDateISO().year;
    const years = [nowYear, nowYear + 1];

    void (async () => {
      try {
        const perYear = await Promise.all(
          years.map(async (year) => {
            const [national, uberlandia] = await Promise.all([
              fetchNationalHolidays(year),
              fetchUberlandiaHolidaysFromApi(year),
            ]);
            return [...national, ...uberlandia];
          }),
        );
        if (!active) return;
        const all = perYear.flat();
        const deduped = Array.from(
          new Map(all.map((h) => [`${h.date}:${h.name}`, h])).values(),
        );
        setHolidayEvents(holidayEntriesToCalendarEvents(deduped));
      } catch {
        if (!active) return;
        setHolidayEvents([]);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const birthdayEvents = useMemo(() => {
    const nowYear = Temporal.Now.plainDateISO().year;
    const years = [nowYear, nowYear + 1];
    return birthdayEntriesToCalendarEvents(collaboratorMeta, years);
  }, [collaboratorMeta]);

  const calendars = useMemo(() => {
    const base = calendarsByAccess(access);
    const next: Record<string, CalendarType> = { ...base };
    for (const c of collaboratorMeta) {
      const raw = c.calendar_color?.trim() ?? "#4285F4";
      const safeHex = /^#[0-9A-Fa-f]{6}$/i.test(raw) ? raw : "#4285F4";
      next[`collab_${c.id}`] = collaboratorCalendarFromHex(safeHex, access);
    }
    return next;
  }, [access, collaboratorMeta]);

  const calendarApp = useNextCalendarApp({
    theme: "default",
    locale: "pt-BR",
    timezone: TZ,
    defaultView: "month-grid",
    views: [viewMonthGrid, viewWeek, viewDay],
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
        const sid = String(calEvent.id);
        if (sid.startsWith("holiday:")) return;
        if (sid.startsWith("birthday:")) return;
        const row = rowsRef.current.find((r) => r.id === sid);
        if (!row) return;
        setDetailOpen(row);
      },
      onBeforeEventUpdate: (calEvent) => {
        const sid = String(calEvent.id);
        return (
          access === "admin" &&
          !sid.startsWith("holiday:") &&
          !sid.startsWith("birthday:")
        );
      },
      onEventUpdate: async (calEvent) => {
        if (access !== "admin") return;
        const id = String(calEvent.id);
        if (id.startsWith("holiday:") || id.startsWith("birthday:")) return;
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
    // #region agent log
    fetch("http://127.0.0.1:7285/ingest/5ec2dab7-dfe7-4ae0-84b8-6b4bcc309c97", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f92143",
      },
      body: JSON.stringify({
        sessionId: "f92143",
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "components/schedule-calendar.tsx:calendarAppInit",
        message: "Calendar initialized",
        data: {
          configuredViews: ["month-grid", "week", "day"],
          selectedView:
            (calendarApp as { calendarState?: { view?: { value?: string } } })
              .calendarState?.view?.value ?? "unknown",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [calendarApp]);

  useEffect(() => {
    if (!calendarApp) return;
    calendarApp.events.set([
      ...mapRowsToCalendarEvents(rows),
      ...holidayEvents,
      ...birthdayEvents,
    ]);
  }, [birthdayEvents, calendarApp, holidayEvents, rows]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formClient) {
      alert("Selecione um cliente.");
      return;
    }
    if (!formCollaborator) {
      alert("Selecione um colaborador.");
      return;
    }
    if (!formStart || !formEnd) {
      alert("Informe início e fim.");
      return;
    }
    const startIso = new Date(formStart).toISOString();
    const endIso = new Date(formEnd).toISOString();
    setSaving(true);
    try {
      const res = await createEvent({
        title: formTitle,
        description: formDesc,
        clientId: formClient.id,
        collaboratorId: formCollaborator.id,
        startsAt: startIso,
        endsAt: endIso,
      });
      // #region agent log
      fetch("http://127.0.0.1:7285/ingest/5ec2dab7-dfe7-4ae0-84b8-6b4bcc309c97", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "f92143",
        },
        body: JSON.stringify({
          sessionId: "f92143",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "components/schedule-calendar.tsx:handleCreateSubmit",
          message: "createEvent response",
          data: { ok: res.ok, error: res.ok ? null : res.error },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setCreateOpen(false);
      setFormTitle("");
      setFormDesc("");
      setFormClient(null);
      setFormCollaborator(null);
      setFormStart("");
      setFormEnd("");
      await refresh();
    } catch {
      alert("Não foi possível criar o evento agora.");
    } finally {
      setSaving(false);
    }
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

  async function handleDelete() {
    if (!detailOpen || access !== "admin") return;
    const confirmed = window.confirm(
      "Deseja excluir este agendamento? Esta ação não pode ser desfeita.",
    );
    if (!confirmed) return;
    setSaving(true);
    const res = await deleteEvent(detailOpen.id);
    setSaving(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setDetailOpen(null);
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
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: eventStatusColor(s) }}
              />
              {EVENT_STATUS_LABELS[s]}
            </span>
          ))}
          <span className="text-zinc-500">
            Eventos com colaborador usam a cor definida no cadastro da equipe.
          </span>
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
              <CollaboratorCombobox
                value={formCollaborator}
                onChange={setFormCollaborator}
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
                    lang="pt-BR"
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                  />
                  {formStart && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDateTimePtBr(new Date(formStart).toISOString())}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Fim</label>
                  <input
                    type="datetime-local"
                    lang="pt-BR"
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                  />
                  {formEnd && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDateTimePtBr(new Date(formEnd).toISOString())}
                    </p>
                  )}
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

      {detailOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">
              {detailOpen.title?.trim() || "Agendamento"}
            </h2>
            <div className="space-y-2 text-sm text-zinc-700">
              <p>
                <span className="font-medium text-zinc-900">Cliente:</span>{" "}
                {detailOpen.clients?.full_name ?? detailOpen.client_id}
              </p>
              <p>
                <span className="font-medium text-zinc-900">Início:</span>{" "}
                {formatDateTimePtBr(detailOpen.starts_at)}
              </p>
              <p>
                <span className="font-medium text-zinc-900">Fim:</span>{" "}
                {formatDateTimePtBr(detailOpen.ends_at)}
              </p>
              <p>
                <span className="font-medium text-zinc-900">Status:</span>{" "}
                {EVENT_STATUS_LABELS[detailOpen.status]}
              </p>
              {detailOpen.description?.trim() && (
                <p>
                  <span className="font-medium text-zinc-900">Descrição:</span>{" "}
                  {detailOpen.description}
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {access === "admin" && detailOpen.status === "pending_approval" && (
                <button
                  type="button"
                  className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white"
                  onClick={() => {
                    setAdminOpen(detailOpen);
                    setAssignId(collaborators[0]?.id ?? "");
                  }}
                >
                  Aprovar/rejeitar
                </button>
              )}
              {access === "admin" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#DB4437] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => void handleDelete()}
                  disabled={saving}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              )}
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                onClick={() => setDetailOpen(null)}
              >
                Fechar
              </button>
            </div>
          </div>
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
