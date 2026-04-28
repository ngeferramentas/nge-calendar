import { Receiver } from "@upstash/qstash";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) {
    return NextResponse.json(
      { error: "QStash signing keys not configured" },
      { status: 503 },
    );
  }

  const signature =
    req.headers.get("upstash-signature") ??
    req.headers.get("Upstash-Signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await req.text();
  const receiver = new Receiver({
    currentSigningKey: current,
    nextSigningKey: next,
  });

  try {
    await receiver.verify({ signature, body });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { eventId?: string };
  try {
    payload = JSON.parse(body) as { eventId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: ev, error: fe } = await supabase
    .from("events")
    .select("id, starts_at, reminder_sent_at, status")
    .eq("id", payload.eventId)
    .single();

  if (fe || !ev) {
    return NextResponse.json({ ok: true, note: "event missing" });
  }

  if (ev.reminder_sent_at || ev.status === "rejected") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const start = new Date(ev.starts_at as string).getTime();
  const now = Date.now();
  const windowMs = 30 * 60 * 1000;
  if (now < start - windowMs - 120_000 || now > start) {
    return NextResponse.json({ ok: true, skipped: "outside_window" });
  }

  await supabase
    .from("events")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", payload.eventId)
    .is("reminder_sent_at", null);

  return NextResponse.json({ ok: true });
}
