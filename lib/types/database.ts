export type UserRole = "admin" | "collaborator";

export type DocumentType = "cpf" | "cnpj";

export type EventStatus =
  | "pending_approval"
  | "approved"
  | "confirmed"
  | "assigned"
  | "rejected";

export type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  can_manage_users: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientRow = {
  id: string;
  document_type: DocumentType;
  document_normalized: string;
  full_name: string;
  email: string;
  phone: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
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
  status: EventStatus;
  starts_at: string;
  ends_at: string;
  approved_by: string | null;
  approved_at: string | null;
  assigned_at: string | null;
  reminder_sent_at: string | null;
  clients?: { full_name: string; document_normalized: string } | null;
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

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  pending_approval: "Pendente",
  approved: "Aprovado",
  confirmed: "Confirmado",
  assigned: "Atribuído",
  rejected: "Rejeitado",
};

export const GOOGLE_PALETTE = {
  blue: "#4285F4",
  red: "#DB4437",
  yellow: "#F4B400",
  green: "#0F9D58",
} as const;

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
