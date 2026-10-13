import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export class EduApiError extends Error {
  constructor(readonly code: string, readonly status: number) { super(errorMessage(code)); }
}
export function eduClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("School sign-in has not been configured.");
  client ??= createClient(url, key, { auth: { storageKey: "freereader-edu-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
  return client;
}

export function assertSessionActor(session: { user: { id: string }; access_token: string } | null, expectedUserId: string) {
  let subject: unknown;
  try { subject = JSON.parse(atob(session!.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub; }
  catch { throw new EduApiError("account_changed", 401); }
  // Decoding here binds the UI operation to an actor, not authorization. The
  // backend independently verifies the JWT signature, claims, and live session.
  if (!expectedUserId || session?.user.id !== expectedUserId || subject !== expectedUserId) throw new EduApiError("account_changed", 401);
}

export async function eduHeaders(expectedUserId: string) {
  const { data, error } = await eduClient().auth.getSession();
  if (error || !data.session) throw new Error("Sign in to your school account.");
  assertSessionActor(data.session, expectedUserId);
  return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" };
}

export async function eduFetch<T>(path: string, expectedUserId: string, init: RequestInit = {}): Promise<T> {
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)) throw new Error("Invalid school API path.");
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(await eduHeaders(expectedUserId))) headers.set(name, value);
  init.signal?.throwIfAborted();
  const response = await fetch(`/api/edu/${path}`, { ...init, headers, cache: "no-store", redirect: "error" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new EduApiError(payload.error ?? "request_failed", response.status);
  return payload as T;
}

export function errorMessage(code?: string) {
  const messages: Record<string, string> = {
    account_changed: "Your signed-in account changed. Reload before continuing.",
    invitation_email_mismatch: "Sign in with the email address this invitation was sent to.",
    invitation_expired_or_used: "This invitation has expired, was revoked, or has already been accepted. Ask your school for a new one.",
    school_access_denied: "Your account no longer has access to this school.",
    assignment_access_denied: "You are not enrolled in a class receiving this assignment.",
    assignment_not_available: "This reading is not available yet, or its access window has closed.",
    assignment_changed_reload: "Someone updated this assignment. Reload before editing it again.",
    last_admin_cannot_be_removed: "Invite another administrator before removing the school's last administrator.",
    edu_service_unavailable: "The school service is unavailable. Please retry.",
    edu_speech_disabled: "School audio has not been enabled yet.",
    edu_disabled: "FreeReader EDU has not been enabled in this environment.",
  };
  return messages[code ?? ""] ?? (code ? code.replace(/_/g, " ") : "The request could not be completed.");
}
