import { eduClient, eduFetch, EduApiError } from "./client";
import type { TelemetryProperties } from "../reader/telemetry";

export type EduEventContext = { assignmentId?: string; versionId?: string; classId?: string };
type Event = ReturnType<typeof identity> & { event_id: string; event_name: string; schema_version: 1; occurred_at: string; properties: TelemetryProperties; edu: EduEventContext };
const flushing = new Set<string>();

function persistent(key: string) {
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

export function identity() {
  const ua = navigator.userAgent;
  const match = ua.match(/Windows NT ([0-9.]+)/) ?? ua.match(/Mac OS X ([0-9_]+)/) ?? ua.match(/Android ([0-9.]+)/) ?? ua.match(/(?:iPhone|iPad).*OS ([0-9_]+)/);
  const version = match?.[1].replace(/_/g, ".") ?? "0";
  let installation = "", session = "";
  try {
    installation = persistent("freereader-edu-installation");
    const stored = JSON.parse(sessionStorage.getItem("freereader-edu-session") ?? "null") as { id: string; started: number } | null;
    session = stored && Date.now() - stored.started < 2 * 3600_000 ? stored.id : crypto.randomUUID();
    if (stored?.id !== session) sessionStorage.setItem("freereader-edu-session", JSON.stringify({ id: session, started: Date.now() }));
  } catch { installation ||= crypto.randomUUID(); session ||= crypto.randomUUID(); }
  return { installation_id: installation, session_id: session, source: "audiobook" as const,
    platform_class: /iPad/.test(ua) ? "tablet" : /iPhone|Android/.test(ua) ? "phone" : "desktop",
    os_version: /^\d{1,2}(\.\d{1,3}){0,2}$/.test(version) ? version : "0",
    app_version: "1.0.0", app_build: "1", device_model: "Web Browser",
    hardware_model: /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Win/.test(ua) ? "Windows PC" : "Unknown" };
}

function readQueue(key: string): Event[] {
  try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

export function recordEduEvent(userId: string, schoolId: string, name: string, properties: TelemetryProperties = {}, context: EduEventContext = {}) {
  if (!userId || !schoolId) return;
  const key = `freereader-edu-events:${userId}:${schoolId}`;
  const event: Event = { ...identity(), event_id: crypto.randomUUID(), event_name: name, schema_version: 1,
    occurred_at: new Date().toISOString(), properties, edu: { ...context } };
  try { localStorage.setItem(key, JSON.stringify([...readQueue(key), event].slice(-500))); }
  catch { return; }
  void flushEduEvents(userId, schoolId);
}

export async function flushEduEvents(userId: string, schoolId: string) {
  const key = `freereader-edu-events:${userId}:${schoolId}`;
  if (flushing.has(key)) return;
  flushing.add(key);
  try {
    let batchSize = 30;
    for (;;) {
      const { data } = await eduClient().auth.getSession();
      if (data.session?.user.id !== userId) return;
      const batch = readQueue(key).slice(0, batchSize);
      if (!batch.length) return;
      try {
        await eduFetch(`schools/${schoolId}/telemetry`, userId, { method: "POST", body: JSON.stringify({ events: batch }), keepalive: true });
      } catch (error) {
        const terminal = error instanceof EduApiError && (error.code.startsWith("invalid_event")
          || ["assignment_not_found", "assignment_access_denied", "class_access_denied", "class_not_found", "event_id_conflict"].includes(error.code));
        if (!terminal) throw error;
        // A withdrawn assignment or invalid event must not block newer events.
        // Isolate the bad event before dropping it; preserve auth/network failures.
        if (batch.length > 1) { batchSize = 1; continue; }
      }
      const sent = new Set(batch.map((event) => event.event_id));
      localStorage.setItem(key, JSON.stringify(readQueue(key).filter((event) => !sent.has(event.event_id))));
    }
  } catch { /* Retain this actor's queue for a later retry; progress has its own API. */ }
  finally { flushing.delete(key); }
}
