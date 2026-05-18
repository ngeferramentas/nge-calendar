import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "@/lib/types/database";

export type EventCollaboratorJoin = {
  collaborator_id: string;
  profiles?: { calendar_color: string; full_name?: string } | null;
};

export function uniqueCollaboratorIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function getEventCollaboratorIds(row: EventRow): string[] {
  const fromJunction =
    row.event_collaborators?.map((ec) => ec.collaborator_id).filter(Boolean) ??
    [];
  if (fromJunction.length > 0) return uniqueCollaboratorIds(fromJunction);
  return row.collaborator_id ? [row.collaborator_id] : [];
}

export function resolveCollaboratorDisplayName(
  collaboratorId: string,
  row: EventRow,
  nameById?: ReadonlyMap<string, string>,
): string {
  const fromJunction = row.event_collaborators?.find(
    (ec) => ec.collaborator_id === collaboratorId,
  );
  const fromJunctionName = fromJunction?.profiles?.full_name?.trim();
  if (fromJunctionName) return fromJunctionName;

  if (row.collaborator_id === collaboratorId) {
    const primary = row.collaborator_profile?.full_name?.trim();
    if (primary) return primary;
  }

  return nameById?.get(collaboratorId)?.trim() || collaboratorId;
}

export function formatEventCollaboratorNames(
  row: EventRow,
  nameById?: ReadonlyMap<string, string>,
): string {
  return getEventCollaboratorIds(row)
    .map((id) => resolveCollaboratorDisplayName(id, row, nameById))
    .join(", ");
}

export function primaryCollaboratorId(ids: string[]): string | null {
  return ids[0] ?? null;
}

export async function syncEventCollaborators(
  supabase: SupabaseClient,
  eventId: string,
  collaboratorIds: string[],
): Promise<void> {
  const unique = uniqueCollaboratorIds(collaboratorIds);
  const { error: delErr } = await supabase
    .from("event_collaborators")
    .delete()
    .eq("event_id", eventId);
  if (delErr) throw delErr;

  if (unique.length === 0) return;

  const { error: insErr } = await supabase.from("event_collaborators").insert(
    unique.map((collaborator_id) => ({
      event_id: eventId,
      collaborator_id,
    })),
  );
  if (insErr) throw insErr;
}
