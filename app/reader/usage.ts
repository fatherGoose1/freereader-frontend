import { telemetryContext } from "./telemetry";

const API_BASE = (process.env.NEXT_PUBLIC_KOKO_BACKEND_URL
  ?? "https://koko-backend-production-c887.up.railway.app").replace(/\/$/, "");

export interface UsageSummary {
  plan: "free" | "pro";
  period: string;
  budget_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
}

export function installationId(): string {
  return telemetryContext().installation_id;
}

async function readSummary(response: Response): Promise<UsageSummary> {
  if (!response.ok) throw new Error("usage_unavailable");
  return await response.json() as UsageSummary;
}

export function fetchUsage(token: string | null): Promise<UsageSummary> {
  return fetch(
    `${API_BASE}/api/v1/freereader/usage?installation_id=${encodeURIComponent(installationId())}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  ).then(readSummary);
}

export function linkInstallation(token: string): Promise<UsageSummary> {
  return fetch(`${API_BASE}/api/v1/freereader/usage/link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ installation_id: installationId() }),
  }).then(readSummary);
}

// "2 hr 5 min", "48 min", etc.
export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${minutes} min`;
}
