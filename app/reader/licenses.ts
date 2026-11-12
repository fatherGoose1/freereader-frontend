const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

export const PENDING_LICENSE_KEY = "freereader-pending-license";
const CROSS_TAB_KEY = `${PENDING_LICENSE_KEY}-cross-tab`;

// Email confirmation may open in a different tab. Keep the code for at most
// one day, but never claim it until a confirmed account is authenticated.
export function rememberPendingLicense(code: string) {
  try { sessionStorage.setItem(PENDING_LICENSE_KEY, code); } catch { /* unavailable */ }
  try { localStorage.setItem(CROSS_TAB_KEY, JSON.stringify({ code, expires: Date.now() + 86_400_000 })); }
  catch { /* unavailable */ }
}

export function pendingLicense(): string | null {
  try {
    const stored = localStorage.getItem(CROSS_TAB_KEY);
    if (stored) {
      const entry = JSON.parse(stored);
      if (typeof entry.code === "string" && typeof entry.expires === "number" && entry.expires > Date.now())
        return entry.code;
      localStorage.removeItem(CROSS_TAB_KEY);
    }
  } catch { /* unavailable */ }
  try { return sessionStorage.getItem(PENDING_LICENSE_KEY); } catch { return null; }
}

export function forgetPendingLicense() {
  try { sessionStorage.removeItem(PENDING_LICENSE_KEY); } catch { /* unavailable */ }
  try { localStorage.removeItem(CROSS_TAB_KEY); } catch { /* unavailable */ }
}

export type LicenseList = {
  total: number;
  available: number;
  licenses: Array<{ code: string; redeemed: boolean; redeemed_at: string | null }>;
};

export async function listLicenses(token: string): Promise<LicenseList> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/licenses`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load licenses.");
  return response.json() as Promise<LicenseList>;
}

export async function redeemLicense(token: string, code: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/freereader/licenses/redeem`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.ok) return;
  const result = await response.json().catch(() => ({}));
  throw new Error(result.error === "already_redeemed" ? "This code has already been used."
    : result.error === "already_paid" ? "This account already has a paid plan."
      : result.error === "invalid_code" ? "That code is not valid." : "Could not redeem the code. Please try again.");
}
