const AUTH_RETURN_KEY = "freereader-auth-return";
const AUTH_RETURN_MAX_AGE_MS = 5 * 60 * 1000;

// Supabase OAuth and email-confirmation returns carry a code in the query
// string (PKCE) or tokens/errors in the hash (implicit). Only those visits may
// resume work left over from an earlier redirect; a plain page load must not.
export function isAuthCallbackUrl(url: URL): boolean {
  if (url.searchParams.has("code") || url.searchParams.has("token_hash") || url.searchParams.has("error")) return true;
  return /(?:^|&)(?:access_token|refresh_token|error)=/.test(url.hash.replace(/^#/, ""));
}

// The root fallback consumes the auth params before replacing the URL, so keep
// a short-lived marker the reader can use to resume a pending code.
export function rememberAuthReturn() {
  try { sessionStorage.setItem(AUTH_RETURN_KEY, String(Date.now())); } catch { /* unavailable */ }
}

export function authReturnPending(): boolean {
  try {
    const startedAt = Number(sessionStorage.getItem(AUTH_RETURN_KEY));
    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < AUTH_RETURN_MAX_AGE_MS) return true;
    sessionStorage.removeItem(AUTH_RETURN_KEY);
  } catch { /* unavailable */ }
  return false;
}