export const PENDING_LICENSE_KEY = "freereader-pending-license";
const CROSS_TAB_KEY = `${PENDING_LICENSE_KEY}-cross-tab`;
const MAX_AGE_MS = 86_400_000;

// Email confirmation may open in a different tab. Keep the code for at most
// one day, but never claim it until a confirmed account is authenticated.
export function rememberPendingLicense(code: string) {
  const entry = JSON.stringify({ code, expires: Date.now() + MAX_AGE_MS });
  try { sessionStorage.setItem(PENDING_LICENSE_KEY, entry); } catch { /* unavailable */ }
  try { localStorage.setItem(CROSS_TAB_KEY, entry); } catch { /* unavailable */ }
}

function unexpiredCode(entry: string | null): string | null {
  if (!entry) return null;
  try {
    const value = JSON.parse(entry) as { code?: unknown; expires?: unknown };
    if (typeof value.code === "string" && typeof value.expires === "number" && value.expires > Date.now()) return value.code;
  } catch { /* Legacy plain-code entries have no expiry to honor. */ }
  return null;
}

export function pendingLicense(): string | null {
  try {
    const stored = localStorage.getItem(CROSS_TAB_KEY);
    if (stored) {
      const code = unexpiredCode(stored);
      if (code) return code;
      localStorage.removeItem(CROSS_TAB_KEY);
    }
  } catch { /* unavailable */ }
  try {
    const stored = sessionStorage.getItem(PENDING_LICENSE_KEY);
    if (stored) {
      const code = unexpiredCode(stored);
      if (code) return code;
      sessionStorage.removeItem(PENDING_LICENSE_KEY);
    }
  } catch { /* unavailable */ }
  return null;
}

export function forgetPendingLicense() {
  try { sessionStorage.removeItem(PENDING_LICENSE_KEY); } catch { /* unavailable */ }
  try { localStorage.removeItem(CROSS_TAB_KEY); } catch { /* unavailable */ }
}

export type LicenseList = {
  total: number;
  available: number;
  licenses: Array<{ code: string; redeemed: boolean; redeemed_at: string | null; expires_at: string; expired: boolean }>;
};

export async function listLicenses(token: string): Promise<LicenseList> {
  const response = await fetch("/api/reader-licenses", {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load licenses.");
  return response.json() as Promise<LicenseList>;
}

export async function redeemLicense(token: string, code: string): Promise<void> {
  const response = await fetch("/api/reader-licenses", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.ok) return;
  const result = await response.json().catch(() => ({}));
  throw new Error(result.error === "already_redeemed" ? "This code has already been used."
    : result.error === "expired_code" ? "This code has expired."
      : result.error === "already_paid" ? "This account already has a paid plan."
        : result.error === "invalid_code" ? "That code is not valid." : "Could not redeem the code. Please try again.");
}
