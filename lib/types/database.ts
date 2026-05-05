export type UserRole = "admin" | "collaborator";

export type DocumentType = "cpf" | "cnpj";

export type EventStatus =
  | "pending_approval"
  | "approved"
  | "assigned"
  | "confirmed"
  | "rejected";

export type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  can_manage_users: boolean;
  calendar_color: string;
  birth_date: string | null;
  created_at: string;
  updated_at: string;
};

/** Public directory row for agenda (from server action, not direct client query). */
export type CollaboratorCalendarMeta = {
  id: string;
  full_name: string;
  calendar_color: string;
  birth_date: string | null;
};

export type ClientRow = {
  id: string;
  document_type: DocumentType;
  document_normalized: string;
  full_name: string;
  email: string;
  phone: string;
  address_line: string;
  bairro: string;
  city: string;
  state: string;
  postal_code: string;
  /** false = deactivated in CRM; still returned by searchClients for event creation */
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  title: string;
  description: string;
  client_id: string;
  collaborator_id: string | null;
  created_by: string;
  /** When true, only admins can read this event (RLS + listEventsForUser). */
  admin_only?: boolean;
  status: EventStatus;
  starts_at: string;
  ends_at: string;
  approved_by: string | null;
  approved_at: string | null;
  assigned_at: string | null;
  reminder_sent_at: string | null;
  clients?: {
    full_name: string;
    document_normalized: string;
    address_line: string;
    bairro: string;
  } | null;
  collaborator_profile?: { calendar_color: string; full_name?: string } | null;
};

export type AuditLogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  created_by: string;
  event_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type EventEditRequestStatus = "pending" | "approved" | "rejected";

/** JSON payload for collaborator edit requests; mirrors allowed fields in validations. */
export type EventEditRequestPayload = {
  title?: string;
  description?: string;
  clientId?: string;
  startsAt?: string;
  endsAt?: string;
};

export type EventEditRequestRow = {
  id: string;
  event_id: string;
  requested_by: string;
  payload: EventEditRequestPayload;
  status: EventEditRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

/** Joined row from listPendingEventEditRequests (server action). */
export type PendingEventEditRequestRow = EventEditRequestRow & {
  event?:
    | (EventRow & {
        clients?: EventRow["clients"];
        collaborator_profile?: EventRow["collaborator_profile"];
      })
    | null;
  requester?: { full_name: string } | null;
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  pending_approval: "Pendente",
  approved: "Aprovado",
  confirmed: "Aprovado",
  assigned: "Atribuído",
  rejected: "Recusado",
};

export const GOOGLE_PALETTE = {
  blue: "#4285F4",
  red: "#DB4437",
  yellow: "#F4B400",
  green: "#0F9D58",
} as const;

/** Preset colors for collaborator calendar picker (hex #RRGGBB). */
export const CALENDAR_COLOR_PRESETS: readonly string[] = [
  GOOGLE_PALETTE.blue,
  GOOGLE_PALETTE.green,
  GOOGLE_PALETTE.red,
  GOOGLE_PALETTE.yellow,
  "#7E57C2",
  "#00ACC1",
  "#FF6D00",
  "#5C6BC0",
] as const;

export function eventStatusColor(status: EventStatus): string {
  switch (status) {
    case "pending_approval":
      return GOOGLE_PALETTE.yellow;
    case "rejected":
      return GOOGLE_PALETTE.red;
    case "assigned":
      return GOOGLE_PALETTE.green;
    case "approved":
    case "confirmed":
    default:
      return GOOGLE_PALETTE.blue;
  }
}
