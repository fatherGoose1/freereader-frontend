export type TelemetryProperties = Record<string, string | number>;

const ENDPOINT = "/api/telemetry";
const APP_VERSION = "1.0.0";
const APP_BUILD = "1";
const QUEUE_KEY = "freereaderTelemetryQueue";
const INSTALL_KEY = "freereaderTelemetryInstallationID";
const SESSION_KEY = "freereaderTelemetrySession";
const SESSION_DURATION_MS = 2 * 60 * 60 * 1_000;
const MAX_QUEUE = 500;
const BATCH_SIZE = 100;

const TRANSMITTED_EVENTS = new Set([
  "app_launch",
  "document_deleted",
  "document_opened",
  "first_playable_audio",
  "gutenberg_book_selected",
  "gutenberg_browse_opened",
  "gutenberg_download_completed",
  "gutenberg_download_failed",
  "gutenberg_download_started",
  "gutenberg_import_completed",
  "gutenberg_search",
  "import_completed",
  "import_failed",
  "playback_first_started",
]);

interface QueuedEvent {
  event_id: string;
  installation_id: string;
  session_id: string;
  event_name: string;
  schema_version: 1;
  occurred_at: string;
  platform_class: string;
  os_version: string;
  app_version: string;
  app_build: string;
  device_model: string;
  hardware_model: string;
  properties: TelemetryProperties;
}

interface TelemetrySession {
  id: string;
  startedAt: number;
}

function persistentId(): string {
  let id = localStorage.getItem(INSTALL_KEY);
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem(INSTALL_KEY, id); } catch { /* storage unavailable */ }
  }
  return id;
}

function osVersion(): string {
  const ua = navigator.userAgent;
  const match = ua.match(/Windows NT ([0-9.]+)/)
    ?? ua.match(/Mac OS X ([0-9_]+)/)
    ?? ua.match(/Android ([0-9.]+)/)
    ?? ua.match(/(?:iPhone|iPad).*OS ([0-9_]+)/);
  const version = match?.[1].replace(/_/g, ".") ?? "0";
  return /^\d{1,2}(\.\d{1,3}){0,2}$/.test(version) ? version : "0";
}

function deviceContext(): { platformClass: string; hardware: string } {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return { platformClass: "phone", hardware: "iPhone" };
  if (/iPad/.test(ua)) return { platformClass: "tablet", hardware: "iPad" };
  if (/Android/.test(ua)) return { platformClass: "phone", hardware: "Android" };
  if (/Mac/.test(ua)) return { platformClass: "desktop", hardware: "Mac" };
  if (/Win/.test(ua)) return { platformClass: "desktop", hardware: "Windows PC" };
  if (/Linux/.test(ua)) return { platformClass: "desktop", hardware: "Linux PC" };
  return { platformClass: "desktop", hardware: "Unknown" };
}

function queue(): QueuedEvent[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedEvent[]; } catch { return []; }
}

function saveQueue(events: QueuedEvent[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE))); } catch { /* drop */ }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let activeSession: TelemetrySession | null = null;

export function recordTelemetry(eventName: string, properties: TelemetryProperties = {}) {
  if (!TRANSMITTED_EVENTS.has(eventName)) return;
  const context = deviceContext();
  const queued: QueuedEvent = {
    event_id: crypto.randomUUID(),
    installation_id: persistentId(),
    session_id: sessionIdentifier(eventName === "app_launch"),
    event_name: eventName,
    schema_version: 1,
    occurred_at: new Date().toISOString(),
    platform_class: context.platformClass,
    os_version: osVersion(),
    app_version: APP_VERSION,
    app_build: APP_BUILD,
    device_model: "Web Browser",
    hardware_model: context.hardware,
    properties,
  };
  const events = [...queue(), queued].slice(-MAX_QUEUE);
  saveQueue(events);
  flushTimer ??= setTimeout(() => { flushTimer = null; void flush(); }, 2_000);
}

function persistedSession(): TelemetrySession | null {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Partial<TelemetrySession> | null;
    if (typeof stored?.id !== "string" || typeof stored.startedAt !== "number") return null;
    return { id: stored.id, startedAt: stored.startedAt };
  } catch {
    return null;
  }
}

function sessionIdentifier(appEntry = false): string {
  if (activeSession && !appEntry) return activeSession.id;

  const now = Date.now();
  const previous = persistedSession() ?? activeSession;
  const age = previous ? now - previous.startedAt : SESSION_DURATION_MS;
  activeSession = previous && age >= 0 && age < SESSION_DURATION_MS
    ? previous
    : { id: crypto.randomUUID(), startedAt: now };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
  } catch {
    // Keep the session in memory when persistent storage is unavailable.
  }
  return activeSession.id;
}

export function flushTelemetry() {
  void flush();
}

async function flush() {
  let events = queue();
  while (events.length) {
    const batch = events.slice(0, BATCH_SIZE);
    let response: Response | null = null;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    } catch {
      return;
    }
    if (response.status === 202) {
      const sent = new Set(batch.map((event) => event.event_id));
      events = events.filter((event) => !sent.has(event.event_id));
      saveQueue(events);
      continue;
    }
    if (response.status === 400) {
      const payload = await response.json().catch(() => null) as { field?: string } | null;
      const index = payload?.field?.match(/^events\[(\d+)\]/)?.[1];
      const drop = index !== undefined ? Number(index) : 0;
      events = events.filter((_, position) => position !== drop);
      saveQueue(events);
      continue;
    }
    return;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushTelemetry);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushTelemetry();
    } else {
      sessionIdentifier(true);
    }
  });
}
