import { supabaseClient } from "./supabase";

// Tracks the current Supabase access token so narration requests can attribute
// generated seconds to the signed-in account without every caller plumbing it.
let token: string | null = null;
let initialized = false;

export function initAuthToken() {
  if (initialized) return;
  initialized = true;
  const supabase = supabaseClient();
  if (!supabase) return;
  void supabase.auth.getSession().then(({ data }) => {
    token = data.session?.access_token ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    token = session?.access_token ?? null;
  });
}

export function currentAccessToken(): string | null {
  initAuthToken();
  return token;
}
