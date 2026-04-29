import { Client } from "@upstash/qstash";

function appUrl() {
  const resolved =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
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
      hypothesisId: "H1",
      location: "lib/reminders/qstash.ts:appUrl",
      message: "Resolved app URL for qstash destination",
      data: { resolved },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return resolved;
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
      hypothesisId: "H1",
      location: "lib/reminders/qstash.ts:scheduleEventReminder",
      message: "Publishing reminder to qstash",
      data: { eventId: params.eventId, url },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (isLoopbackDestination(url)) {
    // #region agent log
    fetch("http://127.0.0.1:7285/ingest/5ec2dab7-dfe7-4ae0-84b8-6b4bcc309c97", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f92143",
      },
      body: JSON.stringify({
        sessionId: "f92143",
        runId: "post-fix",
        hypothesisId: "H1",
        location: "lib/reminders/qstash.ts:scheduleEventReminder",
        message: "Skipped qstash publish due to loopback destination",
        data: { eventId: params.eventId, url },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
