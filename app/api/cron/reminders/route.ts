import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/**
 * Fallback for low-frequency schedulers (for example, Vercel Hobby daily cron).
 * Marks unsent reminders for events starting in the next 24 hours.
 * Secure with Authorization: Bearer CRON_SECRET (Vercel Cron or manual).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const now = Date.now();
  const from = new Date(now).toISOString();
  const to = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("events")
    .select("id")
    .is("reminder_sent_at", null)
    .neq("status", "rejected")
    .gte("starts_at", from)
    .lte("starts_at", to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const row of rows ?? []) {
    await supabase
      .from("events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("reminder_sent_at", null);
  }

  return NextResponse.json({ processed: rows?.length ?? 0 });
}
