export const MONTHLY_OFFER_END = Date.parse("2026-11-21T08:00:00Z"); // Friday 11:59 p.m. Pacific.

export function offerCountdown(now: number): string {
  const remaining = Math.max(0, Math.ceil((MONTHLY_OFFER_END - now) / 1000));
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor(remaining % 86_400 / 3_600);
  const minutes = Math.floor(remaining % 3_600 / 60);
  const seconds = remaining % 60;
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}
