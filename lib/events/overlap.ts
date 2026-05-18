import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { EventStatus } from "@/lib/types/database";
import { uniqueCollaboratorIds } from "@/lib/events/collaborators";

const BLOCKING_GLOBAL: EventStatus[] = ["approved", "confirmed", "assigned"];

/**
 * Overlap: [start1, end1) intersects [start2, end2) ⇔ start1 < end2 AND end1 > start2
 * Unassigned event: conflicts with global blocking statuses.
 * Assigned: conflicts with same collaborator (non-rejected), including junction rows.
 */
export async function findOverlappingEventIds(
  supabase: SupabaseClient,
  params: {
    startsAt: string;
    endsAt: string;
    collaboratorId: string | null;
    excludeEventId?: string;
  },
): Promise<string[]> {
  const { startsAt, endsAt, collaboratorId, excludeEventId } = params;

  let q = supabase
    .from("events")
    .select("id")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .neq("status", "rejected");

  if (excludeEventId) {
    q = q.neq("id", excludeEventId);
  }

  if (collaboratorId) {
    const { data: junctionRows, error: junctionErr } = await supabase
      .from("event_collaborators")
      .select("event_id")
      .eq("collaborator_id", collaboratorId);
    if (junctionErr) throw junctionErr;

    const junctionEventIds = (junctionRows ?? []).map(
      (r) => r.event_id as string,
    );
    if (junctionEventIds.length > 0) {
      q = q.or(
        `collaborator_id.eq.${collaboratorId},id.in.(${junctionEventIds.join(",")})`,
      );
    } else {
      q = q.eq("collaborator_id", collaboratorId);
    }
  } else {
    q = q.in("status", BLOCKING_GLOBAL);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export async function assertNoTimeOverlap(
  params: {
    startsAt: string;
    endsAt: string;
    collaboratorId?: string | null;
    collaboratorIds?: string[];
    excludeEventId?: string;
  },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const ids = params.collaboratorIds?.length
    ? uniqueCollaboratorIds(params.collaboratorIds)
    : params.collaboratorId
      ? [params.collaboratorId]
      : [null];

  for (const collaboratorId of ids) {
    const overlapIds = await findOverlappingEventIds(supabase, {
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      collaboratorId,
      excludeEventId: params.excludeEventId,
    });
    if (overlapIds.length > 0) {
      throw new Error(
        "Já existe um evento neste intervalo de horário. Escolha outro horário.",
      );
    }
  }
}
