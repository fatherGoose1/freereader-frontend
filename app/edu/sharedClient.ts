import { errorMessage } from "./client";

let fallback = "";
export function guestHeaders() {
  let visitor = "";
  try { visitor = localStorage.getItem("freereader-edu-guest") ?? ""; if (!visitor) { visitor = `${crypto.randomUUID()}${crypto.randomUUID()}`; localStorage.setItem("freereader-edu-guest", visitor); } }
  catch { fallback ||= `${crypto.randomUUID()}${crypto.randomUUID()}`; visitor = fallback; }
  return { "Content-Type": "application/json", "X-FreeReader-Edu-Guest": visitor };
}

export async function sharedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!/^shared\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) throw new Error("Invalid reading link.");
  const response = await fetch(`/api/edu/${path}`, { ...init, headers: guestHeaders(), cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(payload.error));
  return payload as T;
}
