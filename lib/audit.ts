import type { SupabaseClient } from "@supabase/supabase-js";

export async function appendAuditLog(
  supabase: SupabaseClient,
  params: {
    entityType: string;
    entityId: string;
    action: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.rpc("append_audit_log", {
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_metadata: params.metadata ?? {},
  });
  if (error) throw error;
}
