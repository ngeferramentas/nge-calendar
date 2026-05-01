import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { EventStatus } from "@/lib/types/database";

const BLOCKING_GLOBAL: EventStatus[] = ["approved", "confirmed", "assigned"];

/**
 * Overlap: [start1, end1) intersects [start2, end2) ⇔ start1 < end2 AND end1 > start2
 * Unassigned event: conflicts with global blocking statuses.
 * Assigned: conflicts with same collaborator (non-rejected).
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
    q = q.eq("collaborator_id", collaboratorId);
  } else {
    q = q.in("status", BLOCKING_GLOBAL);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export async function assertNoTimeOverlap(
  params: Parameters<typeof findOverlappingEventIds>[1],
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const ids = await findOverlappingEventIds(supabase, params);
  if (ids.length > 0) {
    throw new Error(
      "Já existe um evento neste intervalo de horário. Escolha outro horário.",
    );
  }
}
