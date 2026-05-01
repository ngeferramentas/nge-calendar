import { Client } from "@upstash/qstash";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

function isLoopbackDestination(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return true;
  }
}

function client() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  return new Client({ token });
}

/** Schedule HTTP call at event start minus 30 minutes (Unix seconds). */
export async function scheduleEventReminder(params: {
  eventId: string;
  startsAtIso: string;
}): Promise<void> {
  const c = client();
  if (!c) return;

  const start = new Date(params.startsAtIso).getTime();
  const fireAt = Math.floor((start - 30 * 60 * 1000) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const notBefore = Math.max(fireAt, now + 2);

  const url = `${appUrl()}/api/webhooks/event-reminder`;

  if (isLoopbackDestination(url)) {
    return;
  }

  await c.publishJSON({
    url,
    body: { eventId: params.eventId },
    headers: {
      "Content-Type": "application/json",
    },
    notBefore,
    retries: 3,
  });
}

/** Fire soon (assignment / same-day path). */
export async function publishImmediateEventPing(params: {
  eventId: string;
  kind: "assignment" | "same_day_reminder";
}): Promise<void> {
  const c = client();
  if (!c) return;

  const url = `${appUrl()}/api/webhooks/event-reminder`;
  if (isLoopbackDestination(url)) return;

  await c.publishJSON({
    url,
    body: { eventId: params.eventId, kind: params.kind },
    notBefore: Math.floor(Date.now() / 1000) + 1,
    retries: 2,
  });
}
